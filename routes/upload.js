const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { admin } = require('../firebase');
const { authenticateJWT } = require('../middleware/auth');
const router = express.Router();

// Multer: bellekte tut (disk'e yazmadan önce denetle)
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

// PROTECTED: Only authenticated users can upload files
router.post('/', authenticateJWT, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Dosya bulunamadı.' });
    }

    const allowedFolders = ['foods', 'kitchens', 'hygiene', 'avatars', 'general'];
    const requestedFolder = req.body.folder;
    const folder = allowedFolders.includes(requestedFolder) ? requestedFolder : 'general';

    const timestamp = Date.now();
    const rawExt = (req.file.originalname && req.file.originalname.includes('.'))
      ? req.file.originalname.split('.').pop()
      : 'jpg';
    const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '');
    const baseFileName = `${timestamp}_${Math.random().toString(36).slice(2)}.${ext}`;
    const relativePath = `${folder}/${baseFileName}`;

    // 1. Firebase Storage aktifse ve bucket mevcutsa önce oraya yüklemeyi dene
    if (admin && typeof admin.storage === 'function') {
      try {
        const bucket = admin.storage().bucket('mahallenin-mutfagi.appspot.com');
        const [exists] = await bucket.exists();
        if (exists) {
          const file = bucket.file(relativePath);
          await file.save(req.file.buffer, {
            metadata: { contentType: req.file.mimetype },
            public: true,
          });
          const publicUrl = `https://storage.googleapis.com/mahallenin-mutfagi.appspot.com/${relativePath}`;
          return res.json({ success: true, url: publicUrl });
        }
      } catch (storageErr) {
        console.warn('Firebase Storage devrede değil veya erişilemedi, yerel statik depolamaya yönlendiriliyor:', storageErr.message);
      }
    }

    // 2. Yüksek Güvenilirlikli Statik Depolama (Express /uploads üzerinden sunulur)
    const uploadDir = path.join(__dirname, '../uploads', folder);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const targetFilePath = path.join(uploadDir, baseFileName);
    fs.writeFileSync(targetFilePath, req.file.buffer);

    const rawProto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const protocol = rawProto.split(',')[0].trim();
    const host = req.get('host') || 'mahallenin-mutfagi-backend.onrender.com';
    const publicUrl = `${protocol}://${host}/uploads/${folder}/${baseFileName}`;

    return res.json({ success: true, url: publicUrl });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
