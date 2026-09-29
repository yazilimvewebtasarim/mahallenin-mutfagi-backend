const express = require('express');
const router = express.Router();
const { db } = require('../firebase');
const { authenticateJWT, authorizeRole } = require('../middleware/auth');

// POST /api/v1/chef/finance/update-iban
// PROTECTED: Only authenticated chefs can update their own IBAN
router.post('/update-iban', authenticateJWT, authorizeRole('chef'), async (req, res) => {
  try {
    const chefId = req.user.userId;  // Get from authenticated user
    const { iban } = req.body;
    
    if (!iban) {
      return res.status(400).json({ error: 'IBAN is required' });
    }

    // Use 'users' collection instead of 'chefs'
    await db.collection('users').doc(chefId).update({
      iban: iban
    });

    res.status(200).json({ message: 'IBAN updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/chef/finance/withdraw
// PROTECTED: Only authenticated chefs can withdraw their own funds
router.post('/withdraw', authenticateJWT, authorizeRole('chef'), async (req, res) => {
  try {
    const chefId = req.user.userId;  // Get from authenticated user
    const { amount } = req.body;
    
    if (!amount) {
      return res.status(400).json({ error: 'amount is required' });
    }

    // Validate amount
    if (typeof amount !== 'number' || amount <= 0 || !isFinite(amount)) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    // Use 'users' collection instead of 'chefs'
    const chefRef = db.collection('users').doc(chefId);
    const chefDoc = await chefRef.get();

    if (!chefDoc.exists) {
      return res.status(404).json({ error: 'Chef not found' });
    }

    const chefData = chefDoc.data();
    if ((chefData.balance || 0) < amount) {
      return res.status(400).json({ error: 'Insufficient funds' });
    }

    // Use runTransaction for atomicity
    await db.runTransaction(async (t) => {
      const freshChefDoc = await t.get(chefRef);
      const freshBalance = freshChefDoc.data().balance || 0;
      
      if (freshBalance < amount) {
        throw new Error('Insufficient funds');
      }
      
      // Update chef balance
      t.update(chefRef, {
        balance: freshBalance - amount
      });
      
      // Create withdrawal record
      const withdrawalRef = db.collection('withdrawals').doc();
      t.set(withdrawalRef, {
        chefId,
        amount,
        status: 'pending',
        createdAt: new Date().toISOString()
      });
    });

    res.status(200).json({ 
      message: 'Withdrawal requested successfully',
      success: true
    });
  } catch (error) {
    console.error('Error processing withdrawal:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;