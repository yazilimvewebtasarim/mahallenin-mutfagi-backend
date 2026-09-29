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

    await orderRef.update({
      status,
      updatedAt: new Date().toISOString()
    });

    const updatedDoc = await orderRef.get();

    res.json({ success: true, data: updatedDoc.data() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;