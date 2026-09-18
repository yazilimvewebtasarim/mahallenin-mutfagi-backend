const request = require('supertest');
const app = require('../app');
const { db } = require('../firebase');

jest.mock('../firebase', () => ({
  db: {
    collection: jest.fn()
  }
}));

describe('Customer API (/api/v1/customer)', () => {
  let mockGet, mockDoc, mockWhere;

  beforeEach(() => {
    mockGet = jest.fn();
    mockDoc = jest.fn().mockReturnValue({
      get: mockGet
    });
    mockWhere = jest.fn().mockReturnThis();
    
    // Add get to where chain
    mockWhere = jest.fn().mockImplementation(function() {
      return {
        where: mockWhere,
        get: mockGet
      };
    });

    db.collection.mockReturnValue({
      get: mockGet,
      doc: mockDoc,
      where: mockWhere
    });

    jest.clearAllMocks();
  });

  describe('GET /api/v1/customer/foods', () => {
    it('1. should return 200 and list of available foods', async () => {
      const mockSnapshot = {
        docs: [
          { id: 'f1', data: () => ({ isim: 'Pizza', fiyat: 200, porsiyon_stok: 10, chefId: 'c1' }) }
        ]
      };
      mockGet.mockResolvedValueOnce(mockSnapshot);

      const response = await request(app).get('/api/v1/customer/foods');
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe('f1');
    });

    it('2. should filter foods by chefId', async () => {
      const mockSnapshot = { docs: [] };
      mockGet.mockResolvedValueOnce(mockSnapshot);

      const response = await request(app).get('/api/v1/customer/foods?chefId=c1');
      expect(response.status).toBe(200);
      expect(mockWhere).toHaveBeenCalledWith('chefId', '==', 'c1');
    });

    it('3. should filter foods by search query (case insensitive)', async () => {
      const mockSnapshot = {
        docs: [
          { id: 'f1', data: () => ({ isim: 'Margarita Pizza', fiyat: 200, porsiyon_stok: 10, chefId: 'c1' }) },
          { id: 'f2', data: () => ({ isim: 'Burger', fiyat: 150, porsiyon_stok: 5, chefId: 'c2' }) }
        ]
      };
      mockGet.mockResolvedValueOnce(mockSnapshot);

      const response = await request(app).get('/api/v1/customer/foods?search=pizza');
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].isim).toBe('Margarita Pizza');
    });

    it('4. should return empty list if no match for search', async () => {
      const mockSnapshot = {
        docs: [
          { id: 'f1', data: () => ({ isim: 'Burger', fiyat: 150, porsiyon_stok: 5, chefId: 'c2' }) }
        ]
      };
      mockGet.mockResolvedValueOnce(mockSnapshot);

      const response = await request(app).get('/api/v1/customer/foods?search=pizza');
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(0);
    });

    it('5. should handle foods missing isim gracefully when searching', async () => {
      const mockSnapshot = {
        docs: [
          { id: 'f1', data: () => ({ fiyat: 150, porsiyon_stok: 5, chefId: 'c2' }) }
        ]
      };
      mockGet.mockResolvedValueOnce(mockSnapshot);

      const response = await request(app).get('/api/v1/customer/foods?search=pizza');
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(0);
    });

    it('6. should handle db error on GET /foods', async () => {
      mockGet.mockRejectedValueOnce(new Error('DB Error'));
      const response = await request(app).get('/api/v1/customer/foods');
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

    it('7. should include stock > 0 in initial where clause', async () => {
      const mockSnapshot = { docs: [] };
      mockGet.mockResolvedValueOnce(mockSnapshot);

      await request(app).get('/api/v1/customer/foods');
      expect(mockWhere).toHaveBeenCalledWith('porsiyon_stok', '>', 0);
    });
  });

  describe('POST /api/v1/customer/cart', () => {
    it('8. should return 400 if items is missing', async () => {
      const response = await request(app).post('/api/v1/customer/cart').send({});
      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/Cart items cannot be empty/);
    });

    it('9. should return 400 if items is not an array', async () => {
      const response = await request(app).post('/api/v1/customer/cart').send({ items: 'not_array' });
      expect(response.status).toBe(400);
    });

    it('10. should return 400 if items is an empty array', async () => {
      const response = await request(app).post('/api/v1/customer/cart').send({ items: [] });
      expect(response.status).toBe(400);
    });

    it('11. should return 400 if item is missing foodId', async () => {
      const response = await request(app).post('/api/v1/customer/cart').send({ items: [{ quantity: 2 }] });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid item data');
    });

    it('12. should return 400 if item has zero or negative quantity', async () => {
      const response = await request(app).post('/api/v1/customer/cart').send({ items: [{ foodId: 'f1', quantity: 0 }] });
      expect(response.status).toBe(400);
    });

    it('13. should return 400 if item has non-integer quantity', async () => {
      const response = await request(app).post('/api/v1/customer/cart').send({ items: [{ foodId: 'f1', quantity: 1.5 }] });
      expect(response.status).toBe(400);
    });

    it('14. should return 404 if a food does not exist', async () => {
      mockGet.mockResolvedValueOnce({ exists: false });
      const response = await request(app).post('/api/v1/customer/cart').send({ items: [{ foodId: 'f1', quantity: 1 }] });
      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Food not found');
    });

    it('15. should return 400 if requested quantity exceeds stock', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ porsiyon_stok: 2, chefId: 'c1' }) });
      const response = await request(app).post('/api/v1/customer/cart').send({ items: [{ foodId: 'f1', quantity: 3 }] });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Insufficient stock');
    });

    it('16. should return 409 if items belong to different chefs', async () => {
      mockGet
        .mockResolvedValueOnce({ exists: true, data: () => ({ porsiyon_stok: 10, chefId: 'c1', fiyat: 100 }) })
        .mockResolvedValueOnce({ exists: true, data: () => ({ porsiyon_stok: 10, chefId: 'c2', fiyat: 100 }) });
      
      const response = await request(app).post('/api/v1/customer/cart').send({ 
        items: [{ foodId: 'f1', quantity: 1 }, { foodId: 'f2', quantity: 1 }] 
      });
      
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('KITCHEN_CONFLICT');
    });

    it('17. should return 200 with delivery fee = 0 when total >= 300', async () => {
      mockGet
        .mockResolvedValueOnce({ exists: true, data: () => ({ porsiyon_stok: 10, chefId: 'c1', fiyat: 140 }) })
        .mockResolvedValueOnce({ exists: true, data: () => ({ porsiyon_stok: 10, chefId: 'c1', fiyat: 60 }) });

      const response = await request(app).post('/api/v1/customer/cart').send({ 
        items: [{ foodId: 'f1', quantity: 2 }, { foodId: 'f2', quantity: 1 }] 
      });
      
      expect(response.status).toBe(200);
      expect(response.body.data.subtotal).toBe(340);
      expect(response.body.data.deliveryFee).toBe(0);
      expect(response.body.data.total).toBe(340);
      expect(response.body.data.freeDeliveryRemaining).toBe(0);
    });

    it('18. should return 200 with delivery fee = 30 when total < 300', async () => {
      mockGet
        .mockResolvedValueOnce({ exists: true, data: () => ({ porsiyon_stok: 10, chefId: 'c1', fiyat: 100 }) })
        .mockResolvedValueOnce({ exists: true, data: () => ({ porsiyon_stok: 10, chefId: 'c1', fiyat: 50 }) });

      const response = await request(app).post('/api/v1/customer/cart').send({ 
        items: [{ foodId: 'f1', quantity: 1 }, { foodId: 'f2', quantity: 1 }] 
      });
      
      expect(response.status).toBe(200);
      expect(response.body.data.subtotal).toBe(150);
      expect(response.body.data.deliveryFee).toBe(30);
      expect(response.body.data.total).toBe(180);
      expect(response.body.data.freeDeliveryRemaining).toBe(150);
    });

    it('19. should correctly calculate VAT (10%)', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ porsiyon_stok: 10, chefId: 'c1', fiyat: 110 }) });

      const response = await request(app).post('/api/v1/customer/cart').send({ items: [{ foodId: 'f1', quantity: 1 }] });
      
      expect(response.status).toBe(200);
      expect(response.body.data.subtotal).toBe(110);
      // vatIncluded = 110 - (110 / 1.1) = 110 - 100 = 10
      expect(response.body.data.vatIncluded).toBe(10);
    });

    it('20. should correctly round numbers to 2 decimal places', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ porsiyon_stok: 10, chefId: 'c1', fiyat: 99.99 }) });

      const response = await request(app).post('/api/v1/customer/cart').send({ items: [{ foodId: 'f1', quantity: 1 }] });
      
      expect(response.status).toBe(200);
      expect(response.body.data.subtotal).toBe(99.99);
      expect(response.body.data.total).toBe(129.99);
      // vat = 99.99 - (99.99 / 1.1) = 9.09
      expect(response.body.data.vatIncluded).toBe(9.09);
    });

    it('21. should handle db error on POST /cart', async () => {
      mockGet.mockRejectedValueOnce(new Error('DB Error'));
      const response = await request(app).post('/api/v1/customer/cart').send({ items: [{ foodId: 'f1', quantity: 1 }] });
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });
});
