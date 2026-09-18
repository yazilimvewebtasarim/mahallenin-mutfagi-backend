const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { db } = require('../firebase');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key';

const otpStore = new Map();

// Send OTP
router.post('/register/send-otp', async (req, res) => {
  try {
    const { telefon } = req.body;
    if (!telefon) {
      return res.status(400).json({ error: 'Telefon numarası gerekli' });
    }
    
    // For development, we always use '123456'
    const otp = '123456';
    otpStore.set(telefon, otp);
    
    res.status(200).json({ message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Error in send-otp:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, isim_soyad, telefon, tc_kimlik, otp, role } = req.body;

    if (!email || !password || !isim_soyad || !telefon || !tc_kimlik || !otp) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (otpStore.get(telefon) !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    const validRoles = ['customer', 'chef'];
    const userRole = validRoles.includes(role) ? role : 'customer';

    // Check if user already exists
    const userRef = db.collection('users').where('email', '==', email);
    const snapshot = await userRef.get();

    if (!snapshot.empty) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const newUser = {
      email,
      password_hash,
      isim_soyad,
      telefon,
      tc_kimlik,
      role: userRole,
      createdAt: new Date().toISOString()
    };
    
    if (userRole === 'chef') {
      newUser.orderCount = 0;
      newUser.paidOrderLimit = 10;
      newUser.isVisible = true;
    }

    // Verify OTP then clean up
    otpStore.delete(telefon);

    const docRef = await db.collection('users').add(newUser);

    res.status(201).json({ message: 'User created successfully', userId: docRef.id });

  } catch (error) {
    console.error('Error in register:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const userRef = db.collection('users').where('email', '==', email);
    const snapshot = await userRef.get();

    if (snapshot.empty) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const userDoc = snapshot.docs[0];
    const user = userDoc.data();

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { userId: userDoc.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(200).json({ message: 'Login successful', token });

  } catch (error) {
    console.error('Error in login:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
