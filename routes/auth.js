const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { db } = require('../firebase');
const { authenticateJWT, JWT_SECRET } = require('../middleware/auth');

const otpStore = new Map();
const MAX_OTP_STORE_SIZE = 1000;

// Send OTP
router.post('/register/send-otp', async (req, res) => {
  try {
    const { telefon } = req.body;
    if (!telefon) {
      return res.status(400).json({ error: 'Telefon numarası gerekli' });
    }
    
    // Bound OTP store size to prevent unbounded memory growth
    if (otpStore.size >= MAX_OTP_STORE_SIZE) {
      const oldestKey = otpStore.keys().next().value;
      if (oldestKey !== undefined) otpStore.delete(oldestKey);
    }

    // For development, we always use '123456'
    const otp = '123456';
    otpStore.set(telefon, { code: otp, expiresAt: Date.now() + 5 * 60 * 1000 });
    
    res.status(200).json({ message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Error in send-otp:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, isim_soyad, telefon, tc_kimlik, role } = req.body;

    if (!email || !password || !isim_soyad || !telefon || !tc_kimlik) {
      return res.status(400).json({ error: 'Tüm alanlar zorunludur', field: 'general', message: 'Lütfen tüm alanları doldurunuz.' });
    }

    if (typeof isim_soyad !== 'string' || isim_soyad.trim().length < 2) {
      return res.status(400).json({ error: 'Lütfen ad ve soyadınızı giriniz.', field: 'isim_soyad', message: 'Lütfen ad ve soyadınızı giriniz.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ error: 'Geçerli bir e-posta adresi giriniz.', field: 'email', message: 'Geçerli bir e-posta adresi giriniz.' });
    }

    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Şifreniz en az 6 karakter olmalıdır.', field: 'password', message: 'Şifreniz en az 6 karakter olmalıdır.' });
    }

    const cleanPhone = telefon.toString().trim().replace(/^\+90/, '').replace(/^0/, '');
    if (!/^[1-9][0-9]{9}$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'Telefon numarası 10 haneli olmalıdır (5XX...).', field: 'telefon', message: 'Telefon numarası 10 haneli olmalıdır (5XX...).' });
    }

    const cleanTc = tc_kimlik.toString().trim();
    if (!/^[0-9]{11}$/.test(cleanTc)) {
      return res.status(400).json({ error: 'TC Kimlik numarası 11 haneli olmalıdır.', field: 'tc_kimlik', message: 'TC Kimlik numarası 11 haneli olmalıdır.' });
    }

    const validRoles = ['customer', 'chef'];
    const userRole = validRoles.includes(role) ? role : 'customer';

    // Check if user already exists with this email
    const userRef = db.collection('users').where('email', '==', email.trim().toLowerCase());
    const snapshot = await userRef.get();

    if (!snapshot.empty) {
      return res.status(400).json({ 
        error: 'User already exists', 
        field: 'email', 
        message: 'Bu e-posta adresi ile zaten kayıtlı bir hesap var.' 
      });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const newUser = {
      email: email.trim().toLowerCase(),
      password_hash,
      isim_soyad: isim_soyad.trim(),
      telefon: cleanPhone,
      tc_kimlik: cleanTc,
      role: userRole,
      createdAt: new Date().toISOString()
    };
    
    if (userRole === 'chef') {
      newUser.orderCount = 0;
      newUser.paidOrderLimit = 10;
      newUser.isVisible = true;
      if (req.body.mutfakResmiUrl) {
        newUser.mutfakResmiUrl = req.body.mutfakResmiUrl;
      }
    }

    // Verify OTP then clean up
    otpStore.delete(telefon);

    const docRef = await db.collection('users').add(newUser);

    const token = jwt.sign(
      { userId: docRef.id, email: newUser.email, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    const refreshToken = jwt.sign(
      { userId: docRef.id, email: newUser.email, role: newUser.role, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: '90d' }
    );

    res.status(201).json({ 
      message: 'User created successfully', 
      userId: docRef.id,
      token,
      refreshToken,
      role: userRole,
      isim_soyad: newUser.isim_soyad
    });

  } catch (error) {
    console.error('Error in register:', error);
    res.status(500).json({ error: 'Internal server error', message: 'Sunucuda bir hata oluştu.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required', message: 'E-posta ve şifre zorunludur.' });
    }

    const userRef = db.collection('users').where('email', '==', email.trim().toLowerCase());
    const snapshot = await userRef.get();

    if (snapshot.empty) {
      return res.status(401).json({ error: 'Invalid email or password', message: 'E-posta veya şifre hatalı.' });
    }

    const userDoc = snapshot.docs[0];
    const user = userDoc.data();

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password', message: 'E-posta veya şifre hatalı.' });
    }

    const token = jwt.sign(
      { userId: userDoc.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    const refreshToken = jwt.sign(
      { userId: userDoc.id, email: user.email, role: user.role, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: '90d' }
    );

    res.status(200).json({ 
      message: 'Login successful', 
      token, 
      refreshToken,
      role: user.role, 
      userId: userDoc.id,
      isim_soyad: user.isim_soyad
    });

  } catch (error) {
    console.error('Error in login:', error);
    res.status(500).json({ error: 'Internal server error', message: 'Sunucuda bir hata oluştu.' });
  }
});

// Refresh Token
router.post('/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    jwt.verify(refreshToken, JWT_SECRET, async (err, decoded) => {
      if (err || !decoded || decoded.type !== 'refresh') {
        return res.status(401).json({ error: 'Invalid or expired refresh token' });
      }

      let effectiveRole = decoded.role;
      let effectiveEmail = decoded.email;
      try {
        const userDoc = await db.collection('users').doc(decoded.userId).get();
        if (userDoc && typeof userDoc.exists === 'boolean') {
          if (!userDoc.exists) {
            return res.status(401).json({ error: 'User account no longer exists' });
          }
          const udata = userDoc.data() || {};
          if (udata.role) effectiveRole = udata.role;
          if (udata.email) effectiveEmail = udata.email;
        }
      } catch (_) {}

      const newToken = jwt.sign(
        { userId: decoded.userId, email: effectiveEmail, role: effectiveRole },
        JWT_SECRET,
        { expiresIn: '30d' }
      );

      const newRefreshToken = jwt.sign(
        { userId: decoded.userId, email: effectiveEmail, role: effectiveRole, type: 'refresh' },
        JWT_SECRET,
        { expiresIn: '90d' }
      );

      res.status(200).json({ 
        success: true, 
        token: newToken, 
        refreshToken: newRefreshToken,
        role: effectiveRole,
        userId: decoded.userId
      });
    });
  } catch (error) {
    console.error('Error in refresh-token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Profil güncelleme (hijyen belgesi, mutfak resmi vb.)
// PROTECTED: Requires authentication
router.patch('/profile', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.userId; // Get userId from JWT token, not from request body
    
    // Whitelist of allowed fields that can be updated
    const allowedFields = ['isim_soyad', 'telefon', 'profileImageUrl', 'hijyenBelgesi', 'hijyenBelgesiUrl', 'mutfakResmiUrl'];

    // Build update object with only allowed fields
    const updateData = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }
    
    // Always update the timestamp
    updateData.updatedAt = new Date().toISOString();
    
    await db.collection('users').doc(userId).update(updateData);
    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: error.message });
  }
});

// Change password
// PROTECTED: Requires authentication
router.post('/change-password', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Mevcut şifre ve yeni şifre zorunludur.' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ error: 'Yeni şifre en az 6 karakter olmalıdır.' });
    }

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    const userData = userDoc.data() || {};
    const isMatch = await bcrypt.compare(currentPassword, userData.password_hash || '');
    if (!isMatch) {
      return res.status(401).json({ error: 'Mevcut şifreniz hatalı.' });
    }

    const password_hash = await bcrypt.hash(newPassword, 10);
    await userRef.update({
      password_hash,
      updatedAt: new Date().toISOString()
    });

    res.json({ success: true, message: 'Şifreniz başarıyla güncellendi.' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete account
// PROTECTED: Requires authentication
router.delete('/account', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRef = db.collection('users').doc(userId);
    if (typeof userRef.delete === 'function') {
      await userRef.delete();
    } else {
      await userRef.update({ deleted: true, isVisible: false, deletedAt: new Date().toISOString() });
    }
    res.json({ success: true, message: 'Hesabınız silindi.' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;