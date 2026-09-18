const express = require('express');
const router = express.Router();
const { db } = require('../firebase');

// POST /api/v1/chef/finance/update-iban
router.post('/update-iban', async (req, res) => {
  try {
    const { chefId, iban } = req.body;
    if (!chefId || !iban) {
      return res.status(400).json({ error: 'chefId and iban are required' });
    }

    await db.collection('chefs').doc(chefId).update({
      iban: iban
    });

    res.status(200).json({ message: 'IBAN updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/chef/finance/withdraw
router.post('/withdraw', async (req, res) => {
  try {
    const { chefId, amount } = req.body;
    if (!chefId || !amount) {
      return res.status(400).json({ error: 'chefId and amount are required' });
    }

    const chefRef = db.collection('chefs').doc(chefId);
    const chefDoc = await chefRef.get();

    if (!chefDoc.exists) {
      return res.status(404).json({ error: 'Chef not found' });
    }

    const chefData = chefDoc.data();
    if ((chefData.balance || 0) < amount) {
      return res.status(400).json({ error: 'Insufficient funds' });
    }

    await chefRef.update({
      balance: (chefData.balance || 0) - amount
    });

    const withdrawalRef = db.collection('withdrawals').doc();
    await withdrawalRef.set({
      chefId,
      amount,
      status: 'pending',
      timestamp: new Date()
    });

    res.status(200).json({ message: 'Withdrawal requested successfully', withdrawalId: withdrawalRef.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
