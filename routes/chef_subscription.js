const express = require('express');
const { db } = require('../firebase');
const router = express.Router();
const { authenticateJWT, authorizeRole } = require('../middleware/auth');

// GET SUBSCRIPTION STATUS: GET /api/v1/chef/subscription/status
// PROTECTED: Only authenticated chefs can check their own subscription status
router.get('/status', authenticateJWT, authorizeRole('chef'), async (req, res) => {
  try {
    // Get chefId from authenticated user, not from query
    const chefId = req.user.userId;

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
      iban: data.iban || null  // Return actual IBAN if stored, not mock
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// INITIALIZE CHECKOUT: POST /api/v1/chef/subscription/initialize-checkout
// PROTECTED: Only authenticated chefs can initialize a subscription checkout
router.post('/initialize-checkout', authenticateJWT, authorizeRole('chef'), async (req, res) => {
  try {
    const chefId = req.user.userId;
    const { rights = 10 } = req.body;

    const validRights = [10, 100];
    const selectedRights = validRights.includes(Number(rights)) ? Number(rights) : 10;
    const price = selectedRights === 100 ? 749.00 : 299.00;
    const packageName = selectedRights === 100 ? '100 Sipariş Paketi' : '10 Sipariş Paketi';

    // Transaction / checkout token
    const checkoutToken = `sub_${chefId}_${Date.now()}_${selectedRights}`;

    res.json({
      success: true,
      packageName,
      rights: selectedRights,
      price,
      currency: 'TRY',
      token: checkoutToken,
      paymentPageUrl: `https://sandbox.iyzipay.com/checkout/${checkoutToken}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// NOTIFY PAYMENT: POST /api/v1/chef/subscription/notify-payment
// PROTECTED: Only authenticated chefs can notify payment for their own subscription
router.post('/notify-payment', authenticateJWT, authorizeRole('chef'), async (req, res) => {

  try {
    // Get chefId from authenticated user, not from request body
    const chefId = req.user.userId;
    
    const { rights } = req.body;
    
    const chefRef = db.collection('users').doc(chefId);
    const chefDoc = await chefRef.get();

    if (!chefDoc.exists) {
      return res.status(404).json({ error: 'Chef not found' });
    }

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

    // Update foods to make them visible again
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