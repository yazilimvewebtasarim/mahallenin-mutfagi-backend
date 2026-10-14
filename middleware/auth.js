const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

/**
 * JWT imzalama anahtarını güvenli şekilde çözümler.
 *
 * Öncelik sırası:
 *  1. JWT_SECRET ortam değişkeni (Render panelinden tanımlanırsa).
 *  2. Firebase service account private key'inden HMAC ile türetilen anahtar.
 *     Bu dosya git'e girmez (gizli dosya olarak sunucuda durur), dolayısıyla
 *     herkese açık GitHub deposundan tahmin edilemez.
 *  3. Yalnızca yerel geliştirme / test için sabit anahtar.
 */
// Daha önce herkese açık depoda yer almış, artık güvenli sayılmayan anahtarlar
const COMPROMISED_SECRETS = new Set([
  'dev_jwt_secret_key_mahallenin_mutfagi_default',
  'test_secret_key_123',
]);

function resolveJwtSecret() {
  const envSecret = process.env.JWT_SECRET;
  if (envSecret && envSecret.length >= 16 && !COMPROMISED_SECRETS.has(envSecret)) {
    return envSecret;
  }

  try {
    const candidates = [
      path.join(__dirname, '..', 'serviceAccountKey.json'),
      '/etc/secrets/serviceAccountKey.json',
    ];
    const keyPath = candidates.find((p) => fs.existsSync(p));
    if (keyPath) {
      const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      if (sa.private_key) {
        return crypto
          .createHmac('sha256', sa.private_key)
          .update('mahallenin-mutfagi-jwt-v2')
          .digest('hex');
      }
    }
  } catch (e) {
    console.error('JWT secret derivation failed:', e.message);
  }

  if (process.env.NODE_ENV === 'production') {
    console.error('UYARI: JWT_SECRET tanımlı değil ve serviceAccountKey.json bulunamadı!');
  }
  return 'dev_only_local_secret_not_for_production';
}

const JWT_SECRET = resolveJwtSecret();

/**
 * Middleware to authenticate and verify JWT tokens
 * Extracts user info (userId, email, role) from token and attaches to req.user
 */
function authenticateJWT(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authorization header missing' 
      });
    }

    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : authHeader;

    const decoded = jwt.verify(token, JWT_SECRET);

    // Refresh token'lar API erişimi için kullanılamaz
    if (decoded.type === 'refresh') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }
    
    // Attach user info to request
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        error: 'Token expired' 
      });
    }
    
    // Geçersiz/imzası tutmayan token = kimlik doğrulanamadı (401).
    // Mobil uygulama 401'de sessiz yenileme dener, olmazsa oturumu kapatıp girişe yönlendirir.
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid token' 
      });
    }

    return res.status(401).json({ 
      success: false, 
      error: 'Authentication failed' 
    });
  }
}

/**
 * Middleware to check if user has required role
 * @param {string|string[]} requiredRoles - Single role or array of allowed roles
 */
function authorizeRole(requiredRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        error: 'User not authenticated' 
      });
    }

    const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        error: 'Insufficient permissions' 
      });
    }

    next();
  };
}

module.exports = { authenticateJWT, authorizeRole, JWT_SECRET };