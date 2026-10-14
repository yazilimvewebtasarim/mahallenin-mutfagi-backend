const express = require('express');
const multer = require('multer');
const { authenticateJWT } = require('../middleware/auth');
const { saveFile, detectFileType } = require('../services/file_store');
const router = express.Router();

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Multer: bellekte tut. Tür kontrolü içerik (magic bytes) üzerinden yapılır;
// mobil istemci bazen 'application/octet-stream' gönderebildiği için mimetype'a güvenilmez.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

function publicBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const host = req.get('host') || 'mahallenin-mutfagi-backend.onrender.com';
  const forwarded = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const protocol = forwarded || (isLocal ? req.protocol : 'https');
  return `${protocol}://${host}`;
}

// PROTECTED: Only authenticated users can upload files
router.post('/', authenticateJWT, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Dosya boyutu en fazla 10MB olabilir.'
        : 'Dosya alınamadı.';
      return res.status(400).json({ success: false, message });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({ success: false, message: 'Dosya bulunamadı.' });
    }

    const type = detectFileType(req.file.buffer);
    if (!type) {
      return res.status(400).json({ success: false, message: 'Sadece JPG, PNG, WEBP, HEIC veya PDF yüklenebilir.' });
    }

    const allowedFolders = ['foods', 'kitchens', 'hygiene', 'avatars', 'general'];
    const folder = allowedFolders.includes(req.body.folder) ? req.body.folder : 'general';

    const id = await saveFile(req.file.buffer, {
      contentType: type.contentType,
      folder,
      ownerId: req.user && req.user.userId,
    });

    const url = `${publicBaseUrl(req)}/api/v1/files/${id}.${type.ext}`;
    return res.json({ success: true, url });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, error: 'Dosya kaydedilemedi, lütfen tekrar deneyin.' });
  }
});

module.exports = router;
