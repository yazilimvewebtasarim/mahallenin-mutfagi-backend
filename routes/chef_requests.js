const express = require('express');
const { db } = require('../firebase');
const router = express.Router();
const { authenticateJWT, authorizeRole } = require('../middleware/auth');

// Get requests available to bid on
// PROTECTED: Only authenticated chefs
router.get('/', authenticateJWT, authorizeRole('chef'), async (req, res) => {
  try {
    const chefId = req.user.userId;
    let query = db.collection('food_requests').where('status', '==', 'open');
    
    // If targetChefId is specified in the request, only that chef should see it
    const snapshot = await query.get();
    let requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    requests = requests.filter(r => !r.targetChefId || r.targetChefId === chefId);

    res.json({ success: true, count: requests.length, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bid on a request
// PROTECTED: Only authenticated chefs
router.post('/:requestId/bid', authenticateJWT, authorizeRole('chef'), async (req, res) => {
  try {
    const chefId = req.user.userId;
    const { price, note } = req.body;
    
    if (!price || isNaN(price) || Number(price) <= 0) {
      return res.status(400).json({ success: false, message: 'Valid price is required' });
    }

    const reqRef = db.collection('food_requests').doc(req.params.requestId);
    const doc = await reqRef.get();
    if (!doc.exists) return res.status(404).json({ success: false, message: 'Request not found' });
    
    if (doc.data().status !== 'open') {
      return res.status(400).json({ success: false, message: 'Request is no longer open' });
    }

    if (doc.data().targetChefId && doc.data().targetChefId !== chefId) {
      return res.status(403).json({ success: false, message: 'Forbidden: Request is targeted to another chef' });
    }

    // Fetch chef's display name from users
    let chefName = 'Aşçı';
    try {
      const chefDoc = await db.collection('users').doc(chefId).get();
      if (chefDoc.exists && chefDoc.data().name) {
        chefName = chefDoc.data().name;
      }
    } catch (_) {}

    const bids = doc.data().bids || [];
    const existingBidIndex = bids.findIndex(b => b.chefId === chefId);
    
    const newBid = {
      chefId,
      chefName: req.body.chefName || chefName,
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
    res.json({ success: true, message: 'Bid submitted', data: newBid });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
