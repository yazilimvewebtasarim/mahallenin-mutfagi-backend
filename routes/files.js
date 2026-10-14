const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { readFile } = require('../services/file_store');

router.get('/:file', async (req, res) => {
  try {
    const rawFile = req.params.file;
    if (!rawFile) {
      return res.status(400).send('File parameter missing');
    }

    // Extract ID (e.g. "docId123.jpg" -> "docId123")
    const id = rawFile.includes('.') ? rawFile.split('.')[0] : rawFile;

    // 1. Try reading from durable Firestore file store
    const file = await readFile(id);
    if (file && file.buffer) {
      res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.send(file.buffer);
    }

    // 2. Fallback: check local uploads folder
    const localCandidates = [
      path.join(__dirname, '../uploads', rawFile),
      path.join(__dirname, '../uploads/foods', rawFile),
      path.join(__dirname, '../uploads/kitchens', rawFile),
      path.join(__dirname, '../uploads/hygiene', rawFile),
      path.join(__dirname, '../uploads/avatars', rawFile),
      path.join(__dirname, '../uploads/general', rawFile),
    ];

    for (const cand of localCandidates) {
      if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
        return res.sendFile(cand);
      }
    }

    return res.status(404).send('File not found');
  } catch (error) {
    console.error('Error serving file:', error);
    return res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
