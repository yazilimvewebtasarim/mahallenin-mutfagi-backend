const express = require('express');
const router = express.Router();
const { db } = require('../firebase');

// CREATE: POST /api/v1/chef/foods
router.post('/', async (req, res) => {
  console.log('POST /api/v1/chef/foods called with body:', req.body);
  try {
    const { isim, aciklama, fiyat, porsiyon_stok, alerjen_durumu, resim_url, chefId, ekstralar } = req.body;

    if (!isim || typeof isim !== 'string' || isim.trim() === '') {
      return res.status(400).json({ error: 'Yemek ismi (isim) zorunludur' });
    }

    if (fiyat === undefined || fiyat === null || fiyat === '' || typeof fiyat === 'boolean' || isNaN(Number(fiyat)) || Number(fiyat) <= 0) {
      return res.status(400).json({ error: 'Geçerli bir fiyat girilmelidir (0\'dan büyük)' });
    }

    if (porsiyon_stok === undefined || porsiyon_stok === null || porsiyon_stok === '' || typeof porsiyon_stok === 'boolean' || isNaN(Number(porsiyon_stok)) || Number(porsiyon_stok) < 0) {
      return res.status(400).json({ error: 'Geçerli bir porsiyon stok adedi girilmelidir (0 veya daha büyük)' });
    }

    const now = new Date().toISOString();
    const newFood = {
      isim: isim.trim(),
      aciklama: aciklama ? String(aciklama).trim() : '',
      fiyat: Number(fiyat),
      porsiyon_stok: Number(porsiyon_stok),
      alerjen_durumu: alerjen_durumu ? String(alerjen_durumu).trim() : '',
      resim_url: resim_url ? String(resim_url).trim() : '',
      chefId: chefId || req.user?.userId || 'default_chef',
      ekstralar: Array.isArray(ekstralar) ? ekstralar : [],
      createdAt: now,
      updatedAt: now
    };

    const docRef = await db.collection('foods').add(newFood);

    return res.status(201).json({
      message: 'Yemek başarıyla eklendi',
      id: docRef.id,
      food: {
        id: docRef.id,
        ...newFood
      }
    });
  } catch (error) {
    console.error('Error creating food:', error.message, error.stack);
    return res.status(500).json({ error: 'Sunucu hatası oluştu: ' + error.message });
  }
});

// READ ALL: GET /api/v1/chef/foods
router.get('/', async (req, res) => {
  try {
    const { chefId } = req.query;
    let query = db.collection('foods');

    if (chefId) {
      query = query.where('chefId', '==', chefId);
    }

    const snapshot = await query.get();
    const foods = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.chefIsVisible !== false) {
        foods.push({
          id: doc.id,
          ...data
        });
      }
    });

    return res.status(200).json({ foods });
  } catch (error) {
    console.error('Error fetching foods:', error);
    return res.status(500).json({ error: 'Sunucu hatası oluştu' });
  }
});

// READ ONE: GET /api/v1/chef/foods/:id
router.get('/:id', async (req, res) => {
  try {
    const docRef = db.collection('foods').doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Yemek bulunamadı' });
    }

    return res.status(200).json({
      food: {
        id: doc.id,
        ...doc.data()
      }
    });
  } catch (error) {
    console.error('Error fetching food:', error);
    return res.status(500).json({ error: 'Sunucu hatası oluştu' });
  }
});

// UPDATE: PUT /api/v1/chef/foods/:id
router.put('/:id', async (req, res) => {
  try {
    const docRef = db.collection('foods').doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Yemek bulunamadı' });
    }

    const { isim, aciklama, fiyat, porsiyon_stok, alerjen_durumu, resim_url, ekstralar } = req.body;

    if (isim !== undefined && (typeof isim !== 'string' || isim.trim() === '')) {
      return res.status(400).json({ error: 'Geçersiz yemek ismi' });
    }

    if (fiyat !== undefined && (fiyat === null || fiyat === '' || typeof fiyat === 'boolean' || isNaN(Number(fiyat)) || Number(fiyat) <= 0)) {
      return res.status(400).json({ error: 'Geçersiz fiyat' });
    }

    if (porsiyon_stok !== undefined && (porsiyon_stok === null || porsiyon_stok === '' || typeof porsiyon_stok === 'boolean' || isNaN(Number(porsiyon_stok)) || Number(porsiyon_stok) < 0)) {
      return res.status(400).json({ error: 'Geçersiz porsiyon stok adedi' });
    }

    const updates = {
      ...(isim !== undefined && { isim: isim.trim() }),
      ...(aciklama !== undefined && { aciklama: aciklama ? String(aciklama).trim() : '' }),
      ...(fiyat !== undefined && { fiyat: Number(fiyat) }),
      ...(porsiyon_stok !== undefined && { porsiyon_stok: Number(porsiyon_stok) }),
      ...(alerjen_durumu !== undefined && { alerjen_durumu: alerjen_durumu ? String(alerjen_durumu).trim() : '' }),
      ...(resim_url !== undefined && { resim_url: resim_url ? String(resim_url).trim() : '' }),
      ...(ekstralar !== undefined && { ekstralar: Array.isArray(ekstralar) ? ekstralar : [] }),
      updatedAt: new Date().toISOString()
    };

    await docRef.update(updates);

    return res.status(200).json({
      message: 'Yemek başarıyla güncellendi',
      id: req.params.id
    });
  } catch (error) {
    console.error('Error adding food:', error.message, error.stack);
    return res.status(500).json({ error: 'Sunucu hatası oluştu: ' + error.message });
  }
});

// DELETE: DELETE /api/v1/chef/foods/:id
router.delete('/:id', async (req, res) => {
  try {
    const docRef = db.collection('foods').doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Yemek bulunamadı' });
    }

    await docRef.delete();

    return res.status(200).json({
      message: 'Yemek başarıyla silindi'
    });
  } catch (error) {
    console.error('Error deleting food:', error);
    return res.status(500).json({ error: 'Sunucu hatası oluştu' });
  }
});

module.exports = router;
