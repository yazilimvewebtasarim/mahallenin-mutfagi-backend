const express = require('express');
const multer = require('multer');
const { admin } = require('../firebase');
const router = express.Router();

// Firebase Storage bucket
const bucket = admin.storage().bucket('mahallenin-mutfagi.appspot.com');

// Multer: bellekte tut (disk'e yazma)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // Max 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Sadece JPG, PNG, WEBP veya PDF yüklenebilir.'));
    }
  }
});

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Dosya bulunamadı.' });
    }

    const { folder = 'general' } = req.body; // folder: 'foods', 'kitchens', 'hygiene'
    const timestamp = Date.now();
    const ext = req.file.originalname.split('.').pop();
    const fileName = `${folder}/${timestamp}_${Math.random().toString(36).slice(2)}.${ext}`;

    const file = bucket.file(fileName);
    await file.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype },
      public: true,
    });

    const publicUrl = `https://storage.googleapis.com/mahallenin-mutfagi.appspot.com/${fileName}`;
    res.json({ success: true, url: publicUrl });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
