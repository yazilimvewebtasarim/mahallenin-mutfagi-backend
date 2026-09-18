const request = require('supertest');
const app = require('../app');
const { db } = require('../firebase');

jest.mock('../firebase', () => ({
  db: {
    collection: jest.fn()
  }
}));

describe('Empirical Challenger: Foods API Boundary & Stress Tests', () => {
  let mockAdd, mockGet, mockDoc, mockUpdate, mockDelete, mockWhere;

  beforeEach(() => {
    mockAdd = jest.fn();
    mockGet = jest.fn();
    mockUpdate = jest.fn();
    mockDelete = jest.fn();
    mockDoc = jest.fn().mockReturnValue({
      get: mockGet,
      update: mockUpdate,
      delete: mockDelete
    });
    mockWhere = jest.fn().mockReturnValue({
      get: mockGet
    });

    db.collection.mockReturnValue({
      add: mockAdd,
      get: mockGet,
      doc: mockDoc,
      where: mockWhere
    });

    jest.clearAllMocks();
  });

  describe('Boundary Condition: Negative and Zero Prices', () => {
    it('should reject negative price (-15)', async () => {
      const res = await request(app)
        .post('/api/v1/chef/foods')
        .send({ isim: 'Çorba', fiyat: -15, porsiyon_stok: 10 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/fiyat/i);
      expect(mockAdd).not.toHaveBeenCalled();
    });

    it('should reject fractional negative price (-0.01)', async () => {
      const res = await request(app)
        .post('/api/v1/chef/foods')
        .send({ isim: 'Çorba', fiyat: -0.01, porsiyon_stok: 10 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/fiyat/i);
      expect(mockAdd).not.toHaveBeenCalled();
    });

    it('should reject zero price (0)', async () => {
      const res = await request(app)
        .post('/api/v1/chef/foods')
        .send({ isim: 'Çorba', fiyat: 0, porsiyon_stok: 10 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/fiyat/i);
      expect(mockAdd).not.toHaveBeenCalled();
    });
  });

  describe('Boundary Condition: Stock Values', () => {
    it('should accept zero portion stock (0) as valid boundary', async () => {
      mockAdd.mockResolvedValueOnce({ id: 'food-zero-stock' });
      const res = await request(app)
        .post('/api/v1/chef/foods')
        .send({ isim: 'Çorba', fiyat: 50, porsiyon_stok: 0 });
      expect(res.status).toBe(201);
      expect(res.body.food.porsiyon_stok).toBe(0);
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({ porsiyon_stok: 0 })
      );
    });

    it('should reject negative portion stock (-1)', async () => {
      const res = await request(app)
        .post('/api/v1/chef/foods')
        .send({ isim: 'Çorba', fiyat: 50, porsiyon_stok: -1 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/porsiyon/i);
      expect(mockAdd).not.toHaveBeenCalled();
    });

    it('should reject fractional negative portion stock (-0.5)', async () => {
      const res = await request(app)
        .post('/api/v1/chef/foods')
        .send({ isim: 'Çorba', fiyat: 50, porsiyon_stok: -0.5 });
      expect(res.status).toBe(400);
      expect(mockAdd).not.toHaveBeenCalled();
    });
  });

  describe('Edge Case: Non-numeric and Type Coercion Attacks', () => {
    it('should reject non-numeric string price ("abc")', async () => {
      const res = await request(app)
        .post('/api/v1/chef/foods')
        .send({ isim: 'Pilav', fiyat: 'abc', porsiyon_stok: 5 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/fiyat/i);
      expect(mockAdd).not.toHaveBeenCalled();
    });

    it('should reject object price ({ val: 100 })', async () => {
      const res = await request(app)
        .post('/api/v1/chef/foods')
        .send({ isim: 'Pilav', fiyat: { val: 100 }, porsiyon_stok: 5 });
      expect(res.status).toBe(400);
      expect(mockAdd).not.toHaveBeenCalled();
    });

    it('should reject boolean price (true / false)', async () => {
      const res1 = await request(app)
        .post('/api/v1/chef/foods')
        .send({ isim: 'Pilav', fiyat: true, porsiyon_stok: 5 });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .post('/api/v1/chef/foods')
        .send({ isim: 'Pilav', fiyat: false, porsiyon_stok: 5 });
      expect(res2.status).toBe(400);
      expect(mockAdd).not.toHaveBeenCalled();
    });

    it('should reject non-numeric string portion stock ("five")', async () => {
      const res = await request(app)
        .post('/api/v1/chef/foods')
        .send({ isim: 'Pilav', fiyat: 60, porsiyon_stok: 'five' });
      expect(res.status).toBe(400);
      expect(mockAdd).not.toHaveBeenCalled();
    });

    it('should correctly coerce valid numeric string price and stock', async () => {
      mockAdd.mockResolvedValueOnce({ id: 'food-coerced' });
      const res = await request(app)
        .post('/api/v1/chef/foods')
        .send({ isim: 'Mantı', fiyat: '150.5', porsiyon_stok: '12' });
      expect(res.status).toBe(201);
      expect(res.body.food.fiyat).toBe(150.5);
      expect(typeof res.body.food.fiyat).toBe('number');
      expect(res.body.food.porsiyon_stok).toBe(12);
      expect(typeof res.body.food.porsiyon_stok).toBe('number');
    });
  });

  describe('Edge Case: Empty and Non-string Names', () => {
    it('should reject empty string name', async () => {
      const res = await request(app)
        .post('/api/v1/chef/foods')
        .send({ isim: '', fiyat: 50, porsiyon_stok: 5 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/isim/i);
      expect(mockAdd).not.toHaveBeenCalled();
    });

    it('should reject whitespace-only name', async () => {
      const res = await request(app)
        .post('/api/v1/chef/foods')
        .send({ isim: '    \t\n  ', fiyat: 50, porsiyon_stok: 5 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/isim/i);
      expect(mockAdd).not.toHaveBeenCalled();
    });

    it('should reject numeric name (12345)', async () => {
      const res = await request(app)
        .post('/api/v1/chef/foods')
        .send({ isim: 12345, fiyat: 50, porsiyon_stok: 5 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/isim/i);
      expect(mockAdd).not.toHaveBeenCalled();
    });

    it('should reject boolean name (true)', async () => {
      const res = await request(app)
        .post('/api/v1/chef/foods')
        .send({ isim: true, fiyat: 50, porsiyon_stok: 5 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/isim/i);
      expect(mockAdd).not.toHaveBeenCalled();
    });

    it('should trim surrounding whitespace from valid names', async () => {
      mockAdd.mockResolvedValueOnce({ id: 'food-trimmed' });
      const res = await request(app)
        .post('/api/v1/chef/foods')
        .send({ isim: '  İçli Köfte  ', fiyat: 45, porsiyon_stok: 20 });
      expect(res.status).toBe(201);
      expect(res.body.food.isim).toBe('İçli Köfte');
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({ isim: 'İçli Köfte' })
      );
    });
  });

  describe('Edge Case: Non-existent Documents (GET, PUT, DELETE)', () => {
    it('GET /api/v1/chef/foods/non-existent should return 404 with error message', async () => {
      mockGet.mockResolvedValueOnce({ exists: false });
      const res = await request(app).get('/api/v1/chef/foods/missing-id-999');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Yemek bulunamadı');
      expect(mockDoc).toHaveBeenCalledWith('missing-id-999');
    });

    it('PUT /api/v1/chef/foods/non-existent should return 404 without calling update', async () => {
      mockGet.mockResolvedValueOnce({ exists: false });
      const res = await request(app)
        .put('/api/v1/chef/foods/missing-id-999')
        .send({ fiyat: 100 });
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Yemek bulunamadı');
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('DELETE /api/v1/chef/foods/non-existent should return 404 without calling delete', async () => {
      mockGet.mockResolvedValueOnce({ exists: false });
      const res = await request(app).delete('/api/v1/chef/foods/missing-id-999');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Yemek bulunamadı');
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  describe('Adversarial Security: Mass Assignment & Field Injection', () => {
    it('should NOT store unwhitelisted fields (isAdmin, role, maliciousScript)', async () => {
      mockAdd.mockResolvedValueOnce({ id: 'food-sanitized' });
      const res = await request(app)
        .post('/api/v1/chef/foods')
        .send({
          isim: 'Güveç',
          fiyat: 180,
          porsiyon_stok: 8,
          isAdmin: true,
          role: 'admin',
          __proto__: { injected: true },
          maliciousField: 'DROP TABLE foods'
        });

      expect(res.status).toBe(201);
      expect(res.body.food).not.toHaveProperty('isAdmin');
      expect(res.body.food).not.toHaveProperty('role');
      expect(res.body.food).not.toHaveProperty('maliciousField');

      const savedData = mockAdd.mock.calls[0][0];
      expect(savedData).not.toHaveProperty('isAdmin');
      expect(savedData).not.toHaveProperty('role');
      expect(savedData).not.toHaveProperty('maliciousField');
    });

    it('PUT should NOT update unwhitelisted fields', async () => {
      mockGet.mockResolvedValueOnce({ exists: true });
      mockUpdate.mockResolvedValueOnce({});

      const res = await request(app)
        .put('/api/v1/chef/foods/food-123')
        .send({
          fiyat: 200,
          isAdmin: true,
          role: 'superadmin',
          createdAt: '2020-01-01T00:00:00Z'
        });

      expect(res.status).toBe(200);
      const updatePayload = mockUpdate.mock.calls[0][0];
      expect(updatePayload).not.toHaveProperty('isAdmin');
      expect(updatePayload).not.toHaveProperty('role');
      expect(updatePayload).not.toHaveProperty('createdAt');
      expect(updatePayload).toHaveProperty('fiyat', 200);
      expect(updatePayload).toHaveProperty('updatedAt');
    });
  });

  describe('UTF-8 and International Character Support', () => {
    it('should correctly preserve Turkish characters and emojis', async () => {
      mockAdd.mockResolvedValueOnce({ id: 'food-turkish-char' });
      const res = await request(app)
        .post('/api/v1/chef/foods')
        .send({
          isim: 'Şöbiyet & Çiğbörek 🍲',
          aciklama: 'Öz Gaziantep fıstıklı tatlısı, çıtır çıtır 😋',
          fiyat: 120,
          porsiyon_stok: 10,
          alerjen_durumu: 'Fıstık, Gluten'
        });

      expect(res.status).toBe(201);
      expect(res.body.food.isim).toBe('Şöbiyet & Çiğbörek 🍲');
      expect(res.body.food.aciklama).toBe('Öz Gaziantep fıstıklı tatlısı, çıtır çıtır 😋');
      expect(res.body.food.alerjen_durumu).toBe('Fıstık, Gluten');
    });
  });

  describe('PUT Edge Cases: Validation on Partial Updates', () => {
    it('should reject invalid fiyat during partial update', async () => {
      mockGet.mockResolvedValueOnce({ exists: true });
      const res = await request(app)
        .put('/api/v1/chef/foods/food-123')
        .send({ fiyat: 0 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/fiyat/i);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('should reject negative porsiyon_stok during partial update', async () => {
      mockGet.mockResolvedValueOnce({ exists: true });
      const res = await request(app)
        .put('/api/v1/chef/foods/food-123')
        .send({ porsiyon_stok: -3 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/porsiyon/i);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('should reject null, boolean, or empty string porsiyon_stok during partial update', async () => {
      mockGet.mockResolvedValueOnce({ exists: true });
      const res1 = await request(app)
        .put('/api/v1/chef/foods/food-123')
        .send({ porsiyon_stok: null });
      expect(res1.status).toBe(400);

      mockGet.mockResolvedValueOnce({ exists: true });
      const res2 = await request(app)
        .put('/api/v1/chef/foods/food-123')
        .send({ porsiyon_stok: true });
      expect(res2.status).toBe(400);

      mockGet.mockResolvedValueOnce({ exists: true });
      const res3 = await request(app)
        .put('/api/v1/chef/foods/food-123')
        .send({ porsiyon_stok: '' });
      expect(res3.status).toBe(400);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('should reject null, boolean, or empty string fiyat during partial update', async () => {
      mockGet.mockResolvedValueOnce({ exists: true });
      const res1 = await request(app)
        .put('/api/v1/chef/foods/food-123')
        .send({ fiyat: null });
      expect(res1.status).toBe(400);

      mockGet.mockResolvedValueOnce({ exists: true });
      const res2 = await request(app)
        .put('/api/v1/chef/foods/food-123')
        .send({ fiyat: true });
      expect(res2.status).toBe(400);

      mockGet.mockResolvedValueOnce({ exists: true });
      const res3 = await request(app)
        .put('/api/v1/chef/foods/food-123')
        .send({ fiyat: '' });
      expect(res3.status).toBe(400);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('should reject empty isim during partial update', async () => {
      mockGet.mockResolvedValueOnce({ exists: true });
      const res = await request(app)
        .put('/api/v1/chef/foods/food-123')
        .send({ isim: '   ' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/yemek ismi/i);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('should reject non-string isim during partial update', async () => {
      mockGet.mockResolvedValueOnce({ exists: true });
      const res = await request(app)
        .put('/api/v1/chef/foods/food-123')
        .send({ isim: 999 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/yemek ismi/i);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('should accept porsiyon_stok of 0 on PUT as valid boundary', async () => {
      mockGet.mockResolvedValueOnce({ exists: true });
      mockUpdate.mockResolvedValueOnce({});
      const res = await request(app)
        .put('/api/v1/chef/foods/food-123')
        .send({ porsiyon_stok: 0 });
      expect(res.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ porsiyon_stok: 0 })
      );
    });

    it('handles optional fields when null on PUT by setting empty string instead of literal string "null"', async () => {
      mockGet.mockResolvedValueOnce({ exists: true });
      mockUpdate.mockResolvedValueOnce({});
      const res = await request(app)
        .put('/api/v1/chef/foods/food-123')
        .send({ aciklama: null, resim_url: null, alerjen_durumu: null });
      expect(res.status).toBe(200);
      const callArg = mockUpdate.mock.calls[0][0];
      expect(callArg.aciklama).toBe('');
      expect(callArg.resim_url).toBe('');
      expect(callArg.alerjen_durumu).toBe('');
    });

    it('rejects null, boolean, or empty string coercion on porsiyon_stok with 400', async () => {
      const resNull = await request(app)
        .post('/api/v1/chef/foods')
        .send({ isim: 'Pilav', fiyat: 50, porsiyon_stok: null });
      expect(resNull.status).toBe(400);
      expect(resNull.body.error).toMatch(/porsiyon/i);

      const resBool = await request(app)
        .post('/api/v1/chef/foods')
        .send({ isim: 'Pilav', fiyat: 50, porsiyon_stok: false });
      expect(resBool.status).toBe(400);
      expect(resBool.body.error).toMatch(/porsiyon/i);

      const resEmpty = await request(app)
        .post('/api/v1/chef/foods')
        .send({ isim: 'Pilav', fiyat: 50, porsiyon_stok: '' });
      expect(resEmpty.status).toBe(400);
      expect(resEmpty.body.error).toMatch(/porsiyon/i);
      expect(mockAdd).not.toHaveBeenCalled();
    });

    it('rejects completely empty POST payload {}', async () => {
      const res = await request(app)
        .post('/api/v1/chef/foods')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('handles query param filtering safely when chefId is passed', async () => {
      const mockSnapshot = {
        forEach: (cb) => {
          cb({ id: 'doc-1', data: () => ({ isim: 'Yemek 1', chefId: 'chef-99' }) });
        }
      };
      mockGet.mockResolvedValueOnce(mockSnapshot);

      const res = await request(app).get('/api/v1/chef/foods?chefId=chef-99');
      expect(res.status).toBe(200);
      expect(mockWhere).toHaveBeenCalledWith('chefId', '==', 'chef-99');
      expect(res.body.foods).toHaveLength(1);
    });

    it('handles query param when chefId is empty string without filtering', async () => {
      const mockSnapshot = {
        forEach: (cb) => {
          cb({ id: 'doc-1', data: () => ({ isim: 'Yemek 1' }) });
        }
      };
      mockGet.mockResolvedValueOnce(mockSnapshot);

      const res = await request(app).get('/api/v1/chef/foods?chefId=');
      expect(res.status).toBe(200);
      expect(mockWhere).not.toHaveBeenCalled();
      expect(res.body.foods).toHaveLength(1);
    });

    it('survives Firestore unexpected rejection with 500 error structure', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockGet.mockRejectedValueOnce(new Error('Simulated Firestore outage'));

      const res = await request(app).get('/api/v1/chef/foods');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Sunucu hatası oluştu' });
      consoleSpy.mockRestore();
    });
  });
});


