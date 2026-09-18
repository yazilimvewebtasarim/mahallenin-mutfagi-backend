const express = require('express');
const { db } = require('../firebase');
const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { customerId, items } = req.body;
    
    if (!customerId) {
      return res.status(400).json({ success: false, message: 'customerId is required' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart items cannot be empty' });
    }

    for (const item of items) {
      if (!item.foodId || !item.quantity || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
         return res.status(400).json({ success: false, message: 'Invalid item data' });
      }
    }

    const foodPromises = items.map(item => db.collection('foods').doc(item.foodId).get());
    const foodDocs = await Promise.all(foodPromises);

    const enrichedItems = [];
    let cartChefId = null;

    for (let i = 0; i < foodDocs.length; i++) {
      const doc = foodDocs[i];
      if (!doc.exists) {
        return res.status(404).json({ success: false, message: 'Food not found' });
      }
      
      const foodData = doc.data();
      const requestedQty = items[i].quantity;
      
      if (cartChefId === null) {
        cartChefId = foodData.chefId;
      } else if (cartChefId !== foodData.chefId) {
        return res.status(409).json({
          success: false,
          code: "KITCHEN_CONFLICT",
          message: "Sepette yalnızca tek bir aşçıya ait ürünler bulunabilir."
        });
      }

      if (requestedQty > foodData.porsiyon_stok) {
        return res.status(400).json({ success: false, message: 'Insufficient stock' });
      }

      let itemPrice = foodData.fiyat;
      const extras = items[i].selectedExtras || [];
      for (const ex of extras) {
        itemPrice += (ex.fiyat || 0);
      }

      enrichedItems.push({
        foodId: items[i].foodId,
        quantity: items[i].quantity,
        price: itemPrice,
        isim: foodData.isim,
        selectedExtras: extras
      });
    }

    let subtotal = 0;
    for (const item of enrichedItems) {
      subtotal += item.price * item.quantity;
    }

    const freeDeliveryThreshold = 300;
    const deliveryFee = subtotal >= freeDeliveryThreshold ? 0 : 30;
    const vatIncluded = subtotal - (subtotal / 1.10);
    const total = subtotal + deliveryFee;

    // Create Order
    const newOrderRef = db.collection('orders').doc();
    const orderData = {
      id: newOrderRef.id,
      customerId,
      chefId: cartChefId,
      items: enrichedItems,
      subtotal: Math.round(subtotal * 100) / 100,
      deliveryFee: Math.round(deliveryFee * 100) / 100,
      vatIncluded: Math.round(vatIncluded * 100) / 100,
      total: Math.round(total * 100) / 100,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

// Use a batch to deduct stock and create order atomically
    const batch = db.batch();
    batch.set(newOrderRef, orderData);

    for (let i = 0; i < enrichedItems.length; i++) {
      const foodRef = db.collection('foods').doc(enrichedItems[i].foodId);
      const currentStock = foodDocs[i].data().porsiyon_stok;
      batch.update(foodRef, { porsiyon_stok: currentStock - enrichedItems[i].quantity });
    }

    // Phase 9: Update chef orderCount
    const chefRef = db.collection('users').doc(cartChefId);
    const chefDoc = await chefRef.get();
    
    if (chefDoc.exists && chefDoc.data().role === 'chef') {
      const chefData = chefDoc.data();
      const currentOrderCount = (chefData.orderCount || 0) + 1;
      const paidOrderLimit = chefData.paidOrderLimit || 10;
      
      const chefUpdate = { orderCount: currentOrderCount };
      
      if (currentOrderCount >= paidOrderLimit) {
        chefUpdate.isVisible = false;
        
        // Update all chef's foods to chefIsVisible: false
        const foodsSnapshot = await db.collection('foods').where('chefId', '==', cartChefId).get();
        foodsSnapshot.forEach(doc => {
          batch.update(doc.ref, { chefIsVisible: false });
        });
      }
      
      batch.update(chefRef, chefUpdate);
    }

    await batch.commit();

    res.status(201).json({ success: true, data: orderData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { customerId } = req.query;
    if (!customerId) {
      return res.status(400).json({ success: false, message: 'customerId is required' });
    }

    const snapshot = await db.collection('orders').where('customerId', '==', customerId).orderBy('createdAt', 'desc').get();
    let orders = snapshot.docs.map(doc => doc.data());

    res.json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
