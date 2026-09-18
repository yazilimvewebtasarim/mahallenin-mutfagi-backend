const express = require('express');
const { db } = require('../firebase');
const router = express.Router();

router.post('/create-cash', async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'orderId is required' });
    }

    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    await orderRef.update({
      paymentMethod: 'cash',
      paymentStatus: 'pending' // For cash on delivery, payment is pending until delivery
    });

    res.status(200).json({ success: true, message: 'Cash payment created', orderId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/checkout-form/init', async (req, res) => {
  try {
    const { orderId, amount } = req.body;
    if (!orderId || !amount) {
      return res.status(400).json({ success: false, message: 'orderId and amount are required' });
    }

    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    await orderRef.update({
      paymentMethod: 'credit_card',
      paymentStatus: 'initiated'
    });

    res.status(200).json({ 
      success: true, 
      paymentPageUrl: `https://sandbox.iyzipay.com/checkout/${orderId}`, 
      token: "mock_token_" + orderId 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
