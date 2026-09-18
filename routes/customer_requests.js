const express = require('express');
const { db } = require('../firebase');
const router = express.Router();

// Create a custom food request
router.post('/', async (req, res) => {
  try {
    const { customerId, title, description, budget, targetChefId } = req.body;
    
    if (!customerId || !title || !description) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const newRequest = {
      customerId,
      title,
      description,
      budget: budget || null,
      targetChefId: targetChefId || null,
      status: 'open', // open, accepted, completed, cancelled
      bids: [], // Array of { chefId, chefName, price, note, createdAt }
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const docRef = await db.collection('food_requests').add(newRequest);
    res.status(201).json({ success: true, id: docRef.id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get customer's requests
router.get('/:customerId', async (req, res) => {
  try {
    const snapshot = await db.collection('food_requests').where('customerId', '==', req.params.customerId).orderBy('createdAt', 'desc').get();
    const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ success: true, count: requests.length, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Accept a bid
router.post('/:requestId/accept-bid', async (req, res) => {
  try {
    const { chefId } = req.body;
    const reqRef = db.collection('food_requests').doc(req.params.requestId);
    const doc = await reqRef.get();
    
    if (!doc.exists) return res.status(404).json({ success: false, message: 'Request not found' });
    
    const data = doc.data();
    const bid = data.bids.find(b => b.chefId === chefId);
    if (!bid) return res.status(400).json({ success: false, message: 'Bid not found' });

    await reqRef.update({
      status: 'accepted',
      acceptedBid: bid,
      updatedAt: new Date().toISOString()
    });

    // In real-world, we'd also generate an order here for payment.
    res.json({ success: true, message: 'Bid accepted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
