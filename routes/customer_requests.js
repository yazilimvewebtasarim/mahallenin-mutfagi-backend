const express = require('express');
const { db } = require('../firebase');
const router = express.Router();
const { authenticateJWT, authorizeRole } = require('../middleware/auth');

// Create a custom food request
// PROTECTED: Only authenticated customers
router.post('/', authenticateJWT, authorizeRole('customer'), async (req, res) => {
  try {
    const { title, description, budget, targetChefId } = req.body;
    const customerId = req.user.userId;
    
    if (!title || !description) {
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
    res.status(201).json({ success: true, id: docRef.id, data: { id: docRef.id, ...newRequest } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get customer's requests
// PROTECTED: Only authenticated customers can see their own requests
router.get('/', authenticateJWT, authorizeRole('customer'), async (req, res) => {
  try {
    const customerId = req.user.userId;
    const snapshot = await db.collection('food_requests').where('customerId', '==', customerId).orderBy('createdAt', 'desc').get();
    const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ success: true, count: requests.length, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Backward-compatible with :customerId route
router.get('/:customerId', authenticateJWT, authorizeRole('customer'), async (req, res) => {
  try {
    const customerId = req.user.userId;
    if (req.params.customerId !== customerId) {
      return res.status(403).json({ success: false, message: 'Forbidden: You can only view your own requests' });
    }

    const snapshot = await db.collection('food_requests').where('customerId', '==', customerId).orderBy('createdAt', 'desc').get();
    const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ success: true, count: requests.length, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Accept a bid
// PROTECTED: Only the customer who created the request can accept a bid
router.post('/:requestId/accept-bid', authenticateJWT, authorizeRole('customer'), async (req, res) => {
  try {
    const { chefId } = req.body;
    const customerId = req.user.userId;
    const reqRef = db.collection('food_requests').doc(req.params.requestId);
    const doc = await reqRef.get();
    
    if (!doc.exists) return res.status(404).json({ success: false, message: 'Request not found' });
    
    const data = doc.data();
    if (data.customerId !== customerId) {
      return res.status(403).json({ success: false, message: 'Forbidden: You do not own this request' });
    }

    const bid = (data.bids || []).find(b => b.chefId === chefId);
    if (!bid) return res.status(400).json({ success: false, message: 'Bid not found' });

    await reqRef.update({
      status: 'accepted',
      acceptedBid: bid,
      updatedAt: new Date().toISOString()
    });

    res.json({ success: true, message: 'Bid accepted', data: { ...data, status: 'accepted', acceptedBid: bid } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
