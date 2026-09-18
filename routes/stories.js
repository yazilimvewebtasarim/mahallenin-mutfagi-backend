const express = require('express');
const router = express.Router();
const { db } = require('../firebase');

// GET /api/v1/stories - Get active food stories
router.get('/', async (req, res) => {
  try {
    const storiesRef = db.collection('stories');
    const snapshot = await storiesRef.where('active', '==', true).get();
    
    const stories = [];
    snapshot.forEach(doc => {
      stories.push({ id: doc.id, ...doc.data() });
    });
    
    res.status(200).json({ stories });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
