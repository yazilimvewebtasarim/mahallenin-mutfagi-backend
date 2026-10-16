const express = require('express');
const { db } = require('../firebase');
const router = express.Router();
const { authenticateJWT, authorizeRole } = require('../middleware/auth');

// CREATE ORDER: POST /api/v1/orders
// PROTECTED: Only authenticated customers
router.post('/', authenticateJWT, authorizeRole('customer'), async (req, res) => {
  try {
    const { items, deliveryAddress, customerName, paymentMethod } = req.body;
    
    // Get customerId from authenticated user, not from request body
    const customerId = req.user.userId;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart items cannot be empty' });
    }

    const totalQtyByFoodId = {};
    for (const item of items) {
      if (!item || !item.foodId || !item.quantity || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
         return res.status(400).json({ success: false, message: 'Invalid item data' });
      }
      totalQtyByFoodId[item.foodId] = (totalQtyByFoodId[item.foodId] || 0) + item.quantity;
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
      const foodId = items[i].foodId;
      const totalRequestedForFood = totalQtyByFoodId[foodId];
      
      if (cartChefId === null) {
        cartChefId = foodData.chefId;
      } else if (cartChefId !== foodData.chefId) {
        return res.status(409).json({
          success: false,
          code: "KITCHEN_CONFLICT",
          message: "Sepette yalnızca tek bir aşçıya ait ürünler bulunabilir."
        });
      }

      if (totalRequestedForFood > foodData.porsiyon_stok) {
        return res.status(400).json({ success: false, message: 'Insufficient stock', error: 'Insufficient stock' });
      }

      let itemPrice = Number(foodData.fiyat);
      const rawExtras = Array.isArray(items[i].selectedExtras) ? items[i].selectedExtras : [];
      const validatedExtras = [];
      const serverExtras = Array.isArray(foodData.ekstralar) ? foodData.ekstralar : null;

      for (const ex of rawExtras) {
        if (!ex || typeof ex !== 'object') {
          return res.status(400).json({ success: false, message: 'Invalid extra data', error: 'Invalid extra data' });
        }
        const exName = ex.ad || ex.isim || ex.name || '';
        const rawExPrice = ex.fiyat !== undefined ? ex.fiyat : ex.price;
        if (serverExtras && serverExtras.length > 0) {
          const matched = serverExtras.find(se => (se.ad || se.isim || se.name) === exName);
          if (!matched) {
            return res.status(400).json({ success: false, message: 'Invalid extra option', error: 'Invalid extra option' });
          }
          const extraPrice = Number(matched.fiyat !== undefined ? matched.fiyat : matched.price) || 0;
          if (extraPrice < 0) {
            return res.status(400).json({ success: false, message: 'Extra price cannot be negative', error: 'Extra price cannot be negative' });
          }
          itemPrice += extraPrice;
          validatedExtras.push({ ad: matched.ad || matched.isim || matched.name || exName, fiyat: extraPrice });
        } else {
          const extraPrice = rawExPrice === undefined ? 0 : Number(rawExPrice);
          if (typeof rawExPrice === 'boolean' || isNaN(extraPrice) || extraPrice < 0) {
            return res.status(400).json({ success: false, message: 'Extra price cannot be negative', error: 'Extra price cannot be negative' });
          }
          itemPrice += extraPrice;
          validatedExtras.push({ ad: exName, fiyat: extraPrice });
        }
      }

      enrichedItems.push({
        foodId: items[i].foodId,
        quantity: items[i].quantity,
        price: itemPrice,
        isim: foodData.isim,
        note: items[i].note || '',
        selectedExtras: validatedExtras,
        food: {
          id: items[i].foodId,
          chefId: foodData.chefId,
          isim: foodData.isim || '',
          aciklama: foodData.aciklama || '',
          fiyat: Number(foodData.fiyat) || 0,
          porsiyon_stok: Number(foodData.porsiyon_stok) || 0,
          alerjen_durumu: foodData.alerjen_durumu || '',
          resim_url: foodData.resim_url || ''
        }
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
      customerId,  // Set from authenticated user
      chefId: cartChefId,
      items: enrichedItems,
      subtotal: Math.round(subtotal * 100) / 100,
      deliveryFee: Math.round(deliveryFee * 100) / 100,
      vatIncluded: Math.round(vatIncluded * 100) / 100,
      total: Math.round(total * 100) / 100,
      deliveryAddress: deliveryAddress ? String(deliveryAddress).trim() : '',
      customerName: customerName ? String(customerName).trim() : '',
      paymentMethod: paymentMethod ? String(paymentMethod).trim() : 'cash',
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Use a batch to deduct stock and create order atomically
    const batch = db.batch();
    batch.set(newOrderRef, orderData);

    const updatedFoodIds = new Set();
    for (let i = 0; i < enrichedItems.length; i++) {
      const foodId = enrichedItems[i].foodId;
      if (updatedFoodIds.has(foodId)) continue;
      updatedFoodIds.add(foodId);

      const foodRef = db.collection('foods').doc(foodId);
      const currentStock = foodDocs[i].data().porsiyon_stok;
      batch.update(foodRef, { porsiyon_stok: currentStock - totalQtyByFoodId[foodId] });
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

    res.status(201).json({ success: true, data: orderData, order: orderData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET CUSTOMER ORDERS: GET /api/v1/orders
// PROTECTED: Only authenticated customers can see their own orders
router.get('/', authenticateJWT, authorizeRole('customer'), async (req, res) => {
  try {
    // Get customerId from authenticated user, not from query
    const customerId = req.user.userId;

    const snapshot = await db.collection('orders').where('customerId', '==', customerId).orderBy('createdAt', 'desc').get();
    let orders = snapshot.docs.map(doc => doc.data());

    res.json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// CANCEL ORDER BY CUSTOMER: PUT or POST /api/v1/orders/:id/cancel
// PROTECTED: Customer can cancel their own order while it is still pending
async function handleCustomerCancel(req, res) {
  try {
    const { id } = req.params;
    const customerId = req.user.userId;

    const orderRef = db.collection('orders').doc(id);
    const doc = await orderRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const orderData = doc.data();
    if (orderData.customerId !== customerId) {
      return res.status(403).json({ success: false, message: 'Forbidden: You do not own this order' });
    }

    if (orderData.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Sadece onay bekleyen siparişler iptal edilebilir.' });
    }

    const updatedAt = new Date().toISOString();
    await orderRef.update({ status: 'cancelled', updatedAt });

    // Restore stock for cancelled order
    if (!orderData.isCustomRequest && Array.isArray(orderData.items)) {
      try {
        const qtyByFood = {};
        for (const item of orderData.items) {
          if (item && item.foodId && item.quantity > 0) {
            qtyByFood[item.foodId] = (qtyByFood[item.foodId] || 0) + Number(item.quantity);
          }
        }
        for (const [foodId, qty] of Object.entries(qtyByFood)) {
          const foodRef = db.collection('foods').doc(foodId);
          const foodDoc = await foodRef.get();
          if (foodDoc && foodDoc.exists && typeof foodRef.update === 'function') {
            const currentStock = Number(foodDoc.data().porsiyon_stok) || 0;
            await foodRef.update({ porsiyon_stok: currentStock + qty });
          }
        }
      } catch (_) {}
    }

    const updatedOrder = { ...orderData, status: 'cancelled', updatedAt };
    res.json({ success: true, data: updatedOrder, order: updatedOrder });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

router.put('/:id/cancel', authenticateJWT, authorizeRole('customer'), handleCustomerCancel);
router.post('/:id/cancel', authenticateJWT, authorizeRole('customer'), handleCustomerCancel);

module.exports = router;