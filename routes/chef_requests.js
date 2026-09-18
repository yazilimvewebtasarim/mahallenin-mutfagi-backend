const express = require('express');
const { db } = require('../firebase');
const router = express.Router();

// Get requests available to bid on
router.get('/', async (req, res) => {
  try {
    const { chefId } = req.query;
    let query = db.collection('food_requests').where('status', '==', 'open');
    
    // If targetChefId is specified in the request, only that chef should see it
    const snapshot = await query.get();
    let requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (chefId) {
      requests = requests.filter(r => !r.targetChefId || r.targetChefId === chefId);
    }

    res.json({ success: true, count: requests.length, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bid on a request
router.post('/:requestId/bid', async (req, res) => {
  try {
    const { chefId, chefName, price, note } = req.body;
    
    if (!chefId || !price) {
      return res.status(400).json({ success: false, message: 'Missing chefId or price' });
    }

    const reqRef = db.collection('food_requests').doc(req.params.requestId);
    const doc = await reqRef.get();
    if (!doc.exists) return res.status(404).json({ success: false, message: 'Request not found' });
    
    if (doc.data().status !== 'open') {
      return res.status(400).json({ success: false, message: 'Request is no longer open' });
    }

    const bids = doc.data().bids || [];
    const existingBidIndex = bids.findIndex(b => b.chefId === chefId);
    
    const newBid = {
      chefId,
      chefName: chefName || 'Aşçı',
      price: Number(price),
      note: note || '',
      createdAt: new Date().toISOString()
    };

    if (existingBidIndex >= 0) {
      bids[existingBidIndex] = newBid; // Update bid
    } else {
      bids.push(newBid);
    }

    await reqRef.update({ bids, updatedAt: new Date().toISOString() });
    res.json({ success: true, message: 'Bid submitted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
