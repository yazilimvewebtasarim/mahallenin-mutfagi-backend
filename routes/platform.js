const express = require('express');
const router = express.Router();
const { db } = require('../firebase');

let statsCache = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

router.get('/stats', async (req, res) => {
  try {
    const now = Date.now();
    if (statsCache && (now - lastCacheTime < CACHE_TTL_MS)) {
      return res.json({ success: true, data: statsCache, cached: true });
    }

    // Query active chefs
    const chefsSnap = await db.collection('users')
      .where('role', '==', 'chef')
      .where('isVisible', '==', true)
      .get();
    const totalChefs = chefsSnap.size;

    // Query customers
    const customersSnap = await db.collection('users')
      .where('role', '==', 'customer')
      .get();
    const totalCustomers = customersSnap.size;

    // Query orders count
    const ordersSnap = await db.collection('orders').get();
    const totalOrders = ordersSnap.size;

    // Cities count - calculate unique cities if available, or default to 1 (İstanbul)
    const citiesSet = new Set();
    chefsSnap.docs.forEach(doc => {
      const data = doc.data();
      if (data.sehir) citiesSet.add(data.sehir.trim().toLowerCase());
      if (data.city) citiesSet.add(data.city.trim().toLowerCase());
    });
    const totalCities = Math.max(citiesSet.size, totalChefs > 0 ? 1 : 0);

    statsCache = {
      totalChefs,
      totalCustomers,
      totalOrders,
      totalCities
    };
    lastCacheTime = now;

    res.json({ success: true, data: statsCache, cached: false });
  } catch (error) {
    console.error('Error fetching platform stats:', error);
    res.status(500).json({ success: false, error: 'Platform istatistikleri alınamadı.' });
  }
});

module.exports = router;
