const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { readFile } = require('../services/file_store');

router.get('/:file', async (req, res) => {
  try {
    const rawFile = req.params.file;
    if (!rawFile || typeof rawFile !== 'string') {
      return res.status(400).send('File parameter missing');
    }

    // Prevent path traversal attacks (e.g., ..%2fserviceAccountKey.json)
    const safeFile = path.basename(rawFile);
    if (
      safeFile !== rawFile ||
      rawFile.includes('..') ||
      rawFile.includes('/') ||
      rawFile.includes('\\') ||
      rawFile.includes('\0') ||
      !/^[a-zA-Z0-9_.-]+$/.test(safeFile)
    ) {
      return res.status(400).send('Invalid file name');
    }

    // Extract ID (e.g. "docId123.jpg" -> "docId123")
    const id = safeFile.includes('.') ? safeFile.split('.')[0] : safeFile;
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      return res.status(400).send('Invalid file identifier');
    }

    // 1. Try reading from durable Firestore file store
    const file = await readFile(id);
    if (file && file.buffer) {
      res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.send(file.buffer);
    }

    // 2. Fallback: check local uploads folder strictly within uploads root
    const uploadsRoot = path.resolve(__dirname, '../uploads');
    const localCandidates = [
      path.resolve(uploadsRoot, safeFile),
      path.resolve(uploadsRoot, 'foods', safeFile),
      path.resolve(uploadsRoot, 'kitchens', safeFile),
      path.resolve(uploadsRoot, 'hygiene', safeFile),
      path.resolve(uploadsRoot, 'avatars', safeFile),
      path.resolve(uploadsRoot, 'general', safeFile),
    ];

    for (const cand of localCandidates) {
      if (cand.startsWith(uploadsRoot + path.sep) && fs.existsSync(cand) && fs.statSync(cand).isFile()) {
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
