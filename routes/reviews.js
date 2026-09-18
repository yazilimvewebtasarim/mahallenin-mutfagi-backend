const express = require('express');
const { db } = require('../firebase');
const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { orderId, customerId, chefId, rating, comment } = req.body;
    
    if (!orderId || !customerId || !chefId || rating === undefined) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }

    // Verify order exists
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (orderDoc.data().status !== 'completed' && orderDoc.data().status !== 'delivered') {
      return res.status(400).json({ success: false, message: 'Can only review completed orders' });
    }

    // Ensure not already reviewed
    const existingReviewSnapshot = await db.collection('reviews').where('orderId', '==', orderId).get();
    if (!existingReviewSnapshot.empty) {
      return res.status(400).json({ success: false, message: 'Order already reviewed' });
    }

    const reviewRef = db.collection('reviews').doc();
    const reviewData = {
      id: reviewRef.id,
      orderId,
      customerId,
      chefId,
      rating,
      comment: comment || '',
      createdAt: new Date().toISOString()
    };

    await reviewRef.set(reviewData);

    res.status(201).json({ success: true, data: reviewData });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:chefId', async (req, res) => {
  try {
    const { chefId } = req.params;
    
    if (!chefId) {
      return res.status(400).json({ success: false, message: 'chefId is required' });
    }

    const snapshot = await db.collection('reviews')
      .where('chefId', '==', chefId)
      .orderBy('createdAt', 'desc')
      .get();
      
    const reviews = snapshot.docs.map(doc => doc.data());
    
    let averageRating = 0;
    if (reviews.length > 0) {
      const sum = reviews.reduce((acc, rev) => acc + rev.rating, 0);
      averageRating = parseFloat((sum / reviews.length).toFixed(1));
    }

    res.json({ success: true, count: reviews.length, averageRating, data: reviews });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
