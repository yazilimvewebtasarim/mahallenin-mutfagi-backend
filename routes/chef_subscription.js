const express = require('express');
const { db } = require('../firebase');
const router = express.Router();

router.get('/status', async (req, res) => {
  try {
    // Determine chefId from query, or mock for tests
    const chefId = (req.query && req.query.chefId) || (req.body && req.body.chefId);
    if (!chefId) return res.status(400).json({ error: 'chefId is required' });

    const chefRef = db.collection('users').doc(chefId);
    const chefDoc = await chefRef.get();

    if (!chefDoc.exists) {
      return res.status(404).json({ error: 'Chef not found' });
    }

    const data = chefDoc.data();
    res.json({
      success: true,
      orderCount: data.orderCount || 0,
      paidOrderLimit: data.paidOrderLimit || 10,
      isVisible: data.isVisible !== false,
      iban: "TR12 3456 7890 1234 5678 9012 34" // Mock IBAN
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/notify-payment', async (req, res) => {
  try {
    const { chefId } = req.body;
    if (!chefId) return res.status(400).json({ error: 'chefId is required' });

    const chefRef = db.collection('users').doc(chefId);
    const chefDoc = await chefRef.get();

    if (!chefDoc.exists) {
      return res.status(404).json({ error: 'Chef not found' });
    }

    const { rights } = req.body;
    
    // Default to 10 if not provided for backward compatibility
    let increment = 10;
    if (rights === 10 || rights === 100) {
      increment = rights;
    }
    
    const data = chefDoc.data();
    const currentLimit = data.paidOrderLimit || 10;
    
    await chefRef.update({
      paidOrderLimit: currentLimit + increment,
      isVisible: true
    });

    // Update foods
    const foodsSnapshot = await db.collection('foods').where('chefId', '==', chefId).get();
    const batch = db.batch();
    foodsSnapshot.forEach(doc => {
      batch.update(doc.ref, { chefIsVisible: true });
    });
    await batch.commit();

    res.json({ success: true, message: 'Payment notified and limits updated.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
