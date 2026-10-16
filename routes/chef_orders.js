const express = require('express');
const { db } = require('../firebase');
const router = express.Router();
const { authenticateJWT, authorizeRole } = require('../middleware/auth');

// GET CHEF ORDERS: GET /api/v1/chef/orders
// PROTECTED: Only authenticated chefs can see their own orders
router.get('/', authenticateJWT, authorizeRole('chef'), async (req, res) => {
  try {
    // Get chefId from authenticated user, not from query
    const chefId = req.user.userId;

    const snapshot = await db.collection('orders').where('chefId', '==', chefId).orderBy('createdAt', 'desc').get();
    let orders = snapshot.docs.map(doc => doc.data());

    res.json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// UPDATE ORDER STATUS: PUT /api/v1/chef/orders/:id/status
// PROTECTED: Only authenticated chefs can update their own order status
router.put('/:id/status', authenticateJWT, authorizeRole('chef'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    // Get chefId from authenticated user, not from request body
    const chefId = req.user.userId;

    const validStatuses = ['pending', 'preparing', 'on_the_way', 'completed', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const orderRef = db.collection('orders').doc(id);
    const doc = await orderRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const orderData = doc.data();
    
    // Check authorization: chef can only update their own orders
    if (orderData.chefId !== chefId) {
      return res.status(403).json({ success: false, message: 'Forbidden: Order belongs to another chef' });
    }

    // Status transitions
    const currentStatus = orderData.status;
    if (currentStatus === 'cancelled') {
       return res.status(400).json({ success: false, message: 'Cannot change status of a cancelled order' });
    }
    if (currentStatus === 'completed' && status !== 'completed') {
       return res.status(400).json({ success: false, message: 'Cannot change status of a completed order' });
    }

    const shouldCreditWallet = status === 'completed' && currentStatus !== 'completed' && !orderData.isCredited;
    const shouldRestoreStock = status === 'cancelled' && currentStatus !== 'cancelled' && !orderData.isCustomRequest;

    const updatePayload = {
      status,
      updatedAt: new Date().toISOString(),
      ...(shouldCreditWallet && { isCredited: true })
    };

    await orderRef.update(updatePayload);

    // Restore stock when an order is cancelled
    if (shouldRestoreStock && Array.isArray(orderData.items)) {
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
      } catch (err) {
        console.error('Error restoring stock on cancelled order:', err);
      }
    }

    // Credit chef balance when order is marked completed (idempotent via isCredited)
    if (shouldCreditWallet) {
      try {
        const earnings = Number(orderData.total || orderData.subtotal || 0);
        if (earnings > 0) {
          const chefUserRef = db.collection('users').doc(chefId);
          if (typeof db.runTransaction === 'function') {
            await db.runTransaction(async (t) => {
              const freshChefDoc = await t.get(chefUserRef);
              if (freshChefDoc && freshChefDoc.exists) {
                const currentBalance = Number(freshChefDoc.data().balance) || 0;
                t.update(chefUserRef, {
                  balance: Math.round((currentBalance + earnings) * 100) / 100
                });
              }
            });
          } else {
            const chefUserDoc = await chefUserRef.get();
            if (chefUserDoc && chefUserDoc.exists && typeof chefUserRef.update === 'function') {
              const currentBalance = Number(chefUserDoc.data().balance) || 0;
              await chefUserRef.update({
                balance: Math.round((currentBalance + earnings) * 100) / 100
              });
            }
          }
        }
      } catch (err) {
        console.error('Error crediting chef balance on completed order:', err);
      }
    }

    const updatedDoc = await orderRef.get();
    const updatedData = updatedDoc && typeof updatedDoc.data === 'function' ? updatedDoc.data() : { ...orderData, ...updatePayload };

    res.json({ success: true, data: updatedData, order: updatedData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;