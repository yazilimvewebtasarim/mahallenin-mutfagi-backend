const express = require('express');
const { db } = require('../firebase');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { chefId } = req.query;
    if (!chefId) {
      return res.status(400).json({ success: false, message: 'chefId is required' });
    }

    const snapshot = await db.collection('orders').where('chefId', '==', chefId).orderBy('createdAt', 'desc').get();
    let orders = snapshot.docs.map(doc => doc.data());

    res.json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, chefId } = req.body;

    if (!chefId) {
      return res.status(400).json({ success: false, message: 'chefId is required' });
    }

    const validStatuses = ['pending', 'preparing', 'completed', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const orderRef = db.collection('orders').doc(id);
    const doc = await orderRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const orderData = doc.data();
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
