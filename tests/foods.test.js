const request = require('supertest');
const app = require('../app');
const { db } = require('../firebase');

jest.mock('../firebase', () => ({
  db: {
    collection: jest.fn()
  }
}));

describe('Chef Foods API (/api/v1/chef/foods)', () => {
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

  describe('POST /api/v1/chef/foods', () => {
    it('should create a food dish and return 201 with created object', async () => {
      mockAdd.mockResolvedValueOnce({ id: 'food-abc-123' });

      const payload = {
        isim: 'Karnıyarık',
        aciklama: 'Geleneksel fırında kıymalı patlıcan yemeği',
        fiyat: 140,
        porsiyon_stok: 15,
        alerjen_durumu: 'Glutensiz',
        resim_url: 'https://example.com/images/karniyarik.jpg',
        chefId: 'chef-42'
      };

      const response = await request(app)
        .post('/api/v1/chef/foods')
        .send(payload);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message', 'Yemek başarıyla eklendi');
      expect(response.body).toHaveProperty('id', 'food-abc-123');
      expect(response.body.food).toMatchObject({
        id: 'food-abc-123',
        isim: 'Karnıyarık',
        aciklama: 'Geleneksel fırında kıymalı patlıcan yemeği',
        fiyat: 140,
        porsiyon_stok: 15,
        alerjen_durumu: 'Glutensiz',
        resim_url: 'https://example.com/images/karniyarik.jpg',
        chefId: 'chef-42'
      });
      expect(response.body.food).toHaveProperty('createdAt');
      expect(response.body.food).toHaveProperty('updatedAt');

      expect(db.collection).toHaveBeenCalledWith('foods');
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          isim: 'Karnıyarık',
          aciklama: 'Geleneksel fırında kıymalı patlıcan yemeği',
          fiyat: 140,
          porsiyon_stok: 15,
          alerjen_durumu: 'Glutensiz',
          resim_url: 'https://example.com/images/karniyarik.jpg',
          chefId: 'chef-42'
        })
      );
    });

    it('should default chefId to default_chef if not provided', async () => {
      mockAdd.mockResolvedValueOnce({ id: 'food-default-chef' });

      const payload = {
        isim: 'Mercimek Çorbası',
        fiyat: 60,
        porsiyon_stok: 25
      };

      const response = await request(app)
        .post('/api/v1/chef/foods')
        .send(payload);

      expect(response.status).toBe(201);
      expect(response.body.food.chefId).toBe('default_chef');
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          chefId: 'default_chef'
        })
      );
    });

    it('should return 400 when required fields are missing', async () => {
      // Missing isim
      const res1 = await request(app)
        .post('/api/v1/chef/foods')
        .send({ fiyat: 100, porsiyon_stok: 10 });
      expect(res1.status).toBe(400);
      expect(res1.body).toHaveProperty('error');

      // Missing fiyat
      const res2 = await request(app)
        .post('/api/v1/chef/foods')
        .send({ isim: 'Mantı', porsiyon_stok: 10 });
      expect(res2.status).toBe(400);
      expect(res2.body).toHaveProperty('error');

      // Missing porsiyon_stok
      const res3 = await request(app)
        .post('/api/v1/chef/foods')
        .send({ isim: 'Mantı', fiyat: 150 });
      expect(res3.status).toBe(400);
      expect(res3.body).toHaveProperty('error');
    });

    it('should return 400 when fiyat is negative or zero', async () => {
      const res = await request(app)
        .post('/api/v1/chef/foods')
        .send({ isim: 'Lahmacun', fiyat: 0, porsiyon_stok: 10 });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 400 when porsiyon_stok is negative', async () => {
      const res = await request(app)
        .post('/api/v1/chef/foods')
        .send({ isim: 'Lahmacun', fiyat: 80, porsiyon_stok: -5 });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 500 when Firestore add fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockAdd.mockRejectedValueOnce(new Error('Firestore write error'));

      const response = await request(app)
        .post('/api/v1/chef/foods')
        .send({ isim: 'İskender', fiyat: 220, porsiyon_stok: 5 });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      consoleSpy.mockRestore();
    });
  });

  describe('GET /api/v1/chef/foods', () => {
    it('should return 200 and all foods list', async () => {
      const mockSnapshot = {
        forEach: (callback) => {
          callback({
            id: 'doc-1',
            data: () => ({ isim: 'Karnıyarık', fiyat: 140, porsiyon_stok: 15, chefId: 'chef-1' })
          });
          callback({
            id: 'doc-2',
            data: () => ({ isim: 'Pilav', fiyat: 50, porsiyon_stok: 20, chefId: 'chef-2' })
          });
        }
      };
      mockGet.mockResolvedValueOnce(mockSnapshot);

      const response = await request(app).get('/api/v1/chef/foods');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('foods');
      expect(response.body.foods).toHaveLength(2);
      expect(response.body.foods[0]).toMatchObject({ id: 'doc-1', isim: 'Karnıyarık' });
      expect(response.body.foods[1]).toMatchObject({ id: 'doc-2', isim: 'Pilav' });
      expect(db.collection).toHaveBeenCalledWith('foods');
    });

    it('should filter foods by chefId when query param is present', async () => {
      const mockSnapshot = {
        forEach: (callback) => {
          callback({
            id: 'doc-1',
            data: () => ({ isim: 'Karnıyarık', fiyat: 140, porsiyon_stok: 15, chefId: 'chef-1' })
          });
        }
      };
      mockGet.mockResolvedValueOnce(mockSnapshot);

      const response = await request(app).get('/api/v1/chef/foods?chefId=chef-1');

      expect(response.status).toBe(200);
      expect(mockWhere).toHaveBeenCalledWith('chefId', '==', 'chef-1');
      expect(response.body.foods).toHaveLength(1);
    });

    it('should return 500 when Firestore query fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockGet.mockRejectedValueOnce(new Error('Firestore read error'));

      const response = await request(app).get('/api/v1/chef/foods');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      consoleSpy.mockRestore();
    });
  });

  describe('GET /api/v1/chef/foods/:id', () => {
    it('should return 200 and the food dish if found', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        id: 'food-123',
        data: () => ({
          isim: 'Hünkar Beğendi',
          fiyat: 190,
          porsiyon_stok: 8
        })
      });

      const response = await request(app).get('/api/v1/chef/foods/food-123');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('food');
      expect(response.body.food.id).toBe('food-123');
      expect(response.body.food.isim).toBe('Hünkar Beğendi');
      expect(mockDoc).toHaveBeenCalledWith('food-123');
    });

    it('should return 404 if food dish not found', async () => {
      mockGet.mockResolvedValueOnce({ exists: false });

      const response = await request(app).get('/api/v1/chef/foods/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Yemek bulunamadı');
    });

    it('should return 500 when Firestore read fails on GET /:id', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockGet.mockRejectedValueOnce(new Error('Firestore get error'));

      const response = await request(app).get('/api/v1/chef/foods/food-123');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      consoleSpy.mockRestore();
    });
  });

  describe('PUT /api/v1/chef/foods/:id', () => {
    it('should update food dish details and return 200', async () => {
      mockGet.mockResolvedValueOnce({ exists: true });
      mockUpdate.mockResolvedValueOnce({});

      const response = await request(app)
        .put('/api/v1/chef/foods/food-123')
        .send({
          isim: 'Karnıyarık Güncel',
          aciklama: 'Bol kıymalı',
          fiyat: 160,
          porsiyon_stok: 10,
          alerjen_durumu: 'Glutensiz',
          resim_url: 'https://example.com/karniyarik-new.jpg'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Yemek başarıyla güncellendi');
      expect(response.body).toHaveProperty('id', 'food-123');
      expect(mockDoc).toHaveBeenCalledWith('food-123');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          isim: 'Karnıyarık Güncel',
          aciklama: 'Bol kıymalı',
          fiyat: 160,
          porsiyon_stok: 10,
          alerjen_durumu: 'Glutensiz',
          resim_url: 'https://example.com/karniyarik-new.jpg',
          updatedAt: expect.any(String)
        })
      );
    });

    it('should return 404 if updating non-existent dish', async () => {
      mockGet.mockResolvedValueOnce({ exists: false });

      const response = await request(app)
        .put('/api/v1/chef/foods/non-existent-id')
        .send({ fiyat: 160 });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Yemek bulunamadı');
    });

    it('should return 400 if updating with invalid field values', async () => {
      mockGet.mockResolvedValueOnce({ exists: true });
      const res1 = await request(app)
        .put('/api/v1/chef/foods/food-123')
        .send({ fiyat: -10 });
      expect(res1.status).toBe(400);

      mockGet.mockResolvedValueOnce({ exists: true });
      const res2 = await request(app)
        .put('/api/v1/chef/foods/food-123')
        .send({ porsiyon_stok: -5 });
      expect(res2.status).toBe(400);

      mockGet.mockResolvedValueOnce({ exists: true });
      const res3 = await request(app)
        .put('/api/v1/chef/foods/food-123')
        .send({ isim: '   ' });
      expect(res3.status).toBe(400);
    });

    it('should return 500 when Firestore update fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockGet.mockResolvedValueOnce({ exists: true });
      mockUpdate.mockRejectedValueOnce(new Error('Firestore update error'));

      const response = await request(app)
        .put('/api/v1/chef/foods/food-123')
        .send({ fiyat: 160 });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      consoleSpy.mockRestore();
    });
  });

  describe('DELETE /api/v1/chef/foods/:id', () => {
    it('should delete food dish and return 200', async () => {
      mockGet.mockResolvedValueOnce({ exists: true });
      mockDelete.mockResolvedValueOnce({});

      const response = await request(app).delete('/api/v1/chef/foods/food-123');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Yemek başarıyla silindi');
      expect(mockDoc).toHaveBeenCalledWith('food-123');
      expect(mockDelete).toHaveBeenCalled();
    });

    it('should return 404 if deleting non-existent dish', async () => {
      mockGet.mockResolvedValueOnce({ exists: false });

      const response = await request(app).delete('/api/v1/chef/foods/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Yemek bulunamadı');
    });

    it('should return 500 when Firestore delete fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockGet.mockResolvedValueOnce({ exists: true });
      mockDelete.mockRejectedValueOnce(new Error('Firestore delete error'));

      const response = await request(app).delete('/api/v1/chef/foods/food-123');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      consoleSpy.mockRestore();
    });
  });
});
