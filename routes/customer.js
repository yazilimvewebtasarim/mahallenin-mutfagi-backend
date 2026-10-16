const express = require('express');
const { db } = require('../firebase');
const router = express.Router();

router.get('/chefs', async (req, res) => {
  try {
    const snapshot = await db.collection('users').where('role', '==', 'chef').where('isVisible', '==', true).get();
    let chefs = snapshot.docs.map(doc => ({
      id: doc.id,
      isim_soyad: doc.data().isim_soyad,
      rating: doc.data().rating || 0,
      reviewCount: doc.data().reviewCount || 0,
      imageUrl: doc.data().profileImageUrl || null,
      hijyenBelgesi: doc.data().hijyenBelgesi === true,
      mutfakResmiUrl: doc.data().mutfakResmiUrl || null
    }));
    res.json({ success: true, count: chefs.length, data: chefs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/chefs/:id', async (req, res) => {
  try {
    const doc = await db.collection('users').doc(req.params.id).get();
    if (!doc.exists || doc.data().role !== 'chef') {
      return res.status(404).json({ success: false, message: 'Chef not found' });
    }
    const data = doc.data();
    res.json({
      success: true, 
      data: {
        id: doc.id,
        isim_soyad: data.isim_soyad,
        rating: data.rating || 0,
        reviewCount: data.reviewCount || 0,
        imageUrl: data.profileImageUrl || null,
        hijyenBelgesi: data.hijyenBelgesi === true,
        hijyenBelgesiUrl: data.hijyenBelgesiUrl || null,
        mutfakResmiUrl: data.mutfakResmiUrl || null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/foods', async (req, res) => {
  try {
    const { chefId } = req.query;
    const search = req.query.search || req.query.q;
    let query = db.collection('foods').where('porsiyon_stok', '>', 0);
    
    if (chefId) {
      query = query.where('chefId', '==', chefId);
    }
    
    const snapshot = await query.get();
    let foods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    foods = foods.filter(f => f.chefIsVisible !== false);

    if (search) {
      const s = String(search).toLowerCase();
      foods = foods.filter(f => f.isim && f.isim.toLowerCase().includes(s));
    }

    res.json({ success: true, count: foods.length, data: foods });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/cart', async (req, res) => {
  try {
    const { items } = req.body;
    
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
      const totalRequestedForFood = totalQtyByFoodId[items[i].foodId];
      
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
        return res.status(400).json({ success: false, message: 'Insufficient stock' });
      }

      let itemPrice = Number(foodData.fiyat) || 0;
      const extras = Array.isArray(items[i].selectedExtras) ? items[i].selectedExtras : [];
      const serverExtras = Array.isArray(foodData.ekstralar) ? foodData.ekstralar : null;
      for (const ex of extras) {
        if (!ex || typeof ex !== 'object') continue;
        if (serverExtras && serverExtras.length > 0) {
          const exName = ex.ad || ex.isim || '';
          const matched = serverExtras.find(se => (se.ad || se.isim) === exName);
          if (matched && Number(matched.fiyat) > 0) {
            itemPrice += Number(matched.fiyat);
          }
        } else if (ex.fiyat !== undefined && typeof ex.fiyat !== 'boolean' && !isNaN(Number(ex.fiyat)) && Number(ex.fiyat) >= 0) {
          itemPrice += Number(ex.fiyat);
        }
      }

      enrichedItems.push({
        ...items[i],
        price: itemPrice
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
    const freeDeliveryRemaining = subtotal >= freeDeliveryThreshold ? 0 : freeDeliveryThreshold - subtotal;

    res.json({
      success: true,
      data: {
        items: enrichedItems,
        chefId: cartChefId,
        subtotal: Math.round(subtotal * 100) / 100,
        deliveryFee: Math.round(deliveryFee * 100) / 100,
        vatIncluded: Math.round(vatIncluded * 100) / 100,
        total: Math.round(total * 100) / 100,
        freeDeliveryThreshold,
        freeDeliveryRemaining: Math.round(freeDeliveryRemaining * 100) / 100
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
