const request = require('supertest');
const app = require('../app');
const { db } = require('../firebase');

jest.mock('../firebase', () => ({
  db: {
    collection: jest.fn(),
    batch: jest.fn()
  }
}));

describe('Orders API', () => {
  let mockGet, mockWhere, mockOrderBy, mockDoc, mockSet, mockUpdate, mockCommit, mockAdd;

  beforeEach(() => {
    mockGet = jest.fn();
    mockSet = jest.fn();
    mockUpdate = jest.fn();
    mockCommit = jest.fn();
    mockAdd = jest.fn();
    
    mockDoc = jest.fn().mockReturnValue({
      id: 'mock_doc_id',
      get: mockGet,
      update: mockUpdate,
      set: mockSet
    });

    mockOrderBy = jest.fn().mockImplementation(function() {
      return { get: mockGet, where: mockWhere, orderBy: mockOrderBy };
    });

    mockWhere = jest.fn().mockImplementation(function() {
      return { get: mockGet, where: mockWhere, orderBy: mockOrderBy };
    });

    db.collection.mockReturnValue({
      doc: mockDoc,
      where: mockWhere,
      add: mockAdd,
      get: mockGet
    });

    db.batch.mockReturnValue({
      set: mockSet,
      update: mockUpdate,
      commit: mockCommit
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/orders', () => {
    it('should fail if customerId is missing', async () => {
      const res = await request(app).post('/api/v1/orders').send({ items: [] });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('customerId is required');
    });

    it('should fail if items are missing or empty', async () => {
      const res = await request(app).post('/api/v1/orders').send({ customerId: 'c1', items: [] });
      expect(res.status).toBe(400);
    });

    it('should fail if item data is invalid', async () => {
      const res = await request(app).post('/api/v1/orders').send({ customerId: 'c1', items: [{ foodId: 'f1', quantity: 0 }] });
      expect(res.status).toBe(400);
    });

    it('should fail if food not found', async () => {
      mockGet.mockResolvedValueOnce({ exists: false });
      
      const res = await request(app).post('/api/v1/orders').send({
        customerId: 'c1',
        items: [{ foodId: 'f1', quantity: 1 }]
      });
      
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Food not found');
    });

    it('should fail if kitchen conflict occurs', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ chefId: 'chef1', fiyat: 100, porsiyon_stok: 10 }) })
             .mockResolvedValueOnce({ exists: true, data: () => ({ chefId: 'chef2', fiyat: 50, porsiyon_stok: 10 }) });
             
      const res = await request(app).post('/api/v1/orders').send({
        customerId: 'c1',
        items: [{ foodId: 'f1', quantity: 1 }, { foodId: 'f2', quantity: 1 }]
      });
      
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('KITCHEN_CONFLICT');
    });

    it('should fail if insufficient stock', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ chefId: 'chef1', fiyat: 100, porsiyon_stok: 2 }) });
             
      const res = await request(app).post('/api/v1/orders').send({
        customerId: 'c1',
        items: [{ foodId: 'f1', quantity: 3 }]
      });
      
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Insufficient stock');
    });

    it('should successfully create an order', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ chefId: 'chef1', fiyat: 100, porsiyon_stok: 10, isim: 'Kofte' }) }).mockResolvedValueOnce({ exists: true, data: () => ({ role: 'chef', orderCount: 0, paidOrderLimit: 10 }) });
      mockSet.mockReturnValue();
      mockUpdate.mockReturnValue();
      mockCommit.mockResolvedValue();

      const res = await request(app).post('/api/v1/orders').send({
        customerId: 'c1',
        items: [{ foodId: 'f1', quantity: 1 }]
      });
      
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.customerId).toBe('c1');
      expect(res.body.data.chefId).toBe('chef1');
      expect(res.body.data.total).toBe(130); // 100 + 30 delivery
      expect(res.body.data.items[0].isim).toBe('Kofte');
      expect(mockCommit).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalled();
    });
    
    it('should successfully create an order with free delivery', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ chefId: 'chef1', fiyat: 400, porsiyon_stok: 10, isim: 'Kofte' }) }).mockResolvedValueOnce({ exists: true, data: () => ({ role: 'chef', orderCount: 0, paidOrderLimit: 10 }) });
      mockSet.mockReturnValue();
      mockUpdate.mockReturnValue();
      mockCommit.mockResolvedValue();

      const res = await request(app).post('/api/v1/orders').send({
        customerId: 'c1',
        items: [{ foodId: 'f1', quantity: 1 }]
      });
      
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.deliveryFee).toBe(0);
      expect(res.body.data.total).toBe(400);
    });

    it('should handle internal errors', async () => {
      mockGet.mockRejectedValue(new Error('DB Error'));
      const res = await request(app).post('/api/v1/orders').send({
        customerId: 'c1',
        items: [{ foodId: 'f1', quantity: 1 }]
      });
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/v1/orders', () => {
    it('should fail if customerId is missing', async () => {
      const res = await request(app).get('/api/v1/orders');
      expect(res.status).toBe(400);
    });

    it('should return orders', async () => {
      mockGet.mockResolvedValue({
        docs: [
          { data: () => ({ id: 'o1', customerId: 'c1' }) }
        ]
      });

      const res = await request(app).get('/api/v1/orders?customerId=c1');
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.data[0].id).toBe('o1');
    });

    it('should handle db errors', async () => {
      mockGet.mockRejectedValue(new Error('DB Error'));
      const res = await request(app).get('/api/v1/orders?customerId=c1');
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/v1/chef/orders', () => {
    it('should fail if chefId is missing', async () => {
      const res = await request(app).get('/api/v1/chef/orders');
      expect(res.status).toBe(400);
    });

    it('should return chef orders', async () => {
      mockGet.mockResolvedValue({
        docs: [
          { data: () => ({ id: 'o1', chefId: 'chef1' }) }
        ]
      });

      const res = await request(app).get('/api/v1/chef/orders?chefId=chef1');
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.data[0].id).toBe('o1');
    });

    it('should handle db errors', async () => {
      mockGet.mockRejectedValue(new Error('DB Error'));
      const res = await request(app).get('/api/v1/chef/orders?chefId=chef1');
      expect(res.status).toBe(500);
    });
  });

  describe('PUT /api/v1/chef/orders/:id/status', () => {
    it('should fail if chefId is missing', async () => {
      const res = await request(app).put('/api/v1/chef/orders/o1/status').send({ status: 'preparing' });
      expect(res.status).toBe(400);
    });

    it('should fail if status is invalid', async () => {
      const res = await request(app).put('/api/v1/chef/orders/o1/status').send({ chefId: 'chef1', status: 'invalid' });
      expect(res.status).toBe(400);
    });

    it('should fail if order not found', async () => {
      mockGet.mockResolvedValue({ exists: false });
      const res = await request(app).put('/api/v1/chef/orders/o1/status').send({ chefId: 'chef1', status: 'preparing' });
      expect(res.status).toBe(404);
    });

    it('should fail if order belongs to another chef', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({ chefId: 'chef2' })
      });
      const res = await request(app).put('/api/v1/chef/orders/o1/status').send({ chefId: 'chef1', status: 'preparing' });
      expect(res.status).toBe(403);
    });

    it('should fail if changing cancelled order', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({ chefId: 'chef1', status: 'cancelled' })
      });
      const res = await request(app).put('/api/v1/chef/orders/o1/status').send({ chefId: 'chef1', status: 'preparing' });
      expect(res.status).toBe(400);
    });

    it('should fail if changing completed order to something else', async () => {
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({ chefId: 'chef1', status: 'completed' })
      });
      const res = await request(app).put('/api/v1/chef/orders/o1/status').send({ chefId: 'chef1', status: 'preparing' });
      expect(res.status).toBe(400);
    });

    it('should update status successfully', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ chefId: 'chef1', status: 'pending' })
      }).mockResolvedValueOnce({
        exists: true,
        data: () => ({ chefId: 'chef1', status: 'preparing' })
      });

      mockUpdate.mockResolvedValue();

      const res = await request(app).put('/api/v1/chef/orders/o1/status').send({ chefId: 'chef1', status: 'preparing' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('preparing');
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'preparing' }));
    });

    it('should handle db errors', async () => {
      mockGet.mockRejectedValue(new Error('DB Error'));
      const res = await request(app).put('/api/v1/chef/orders/o1/status').send({ chefId: 'chef1', status: 'preparing' });
      expect(res.status).toBe(500);
    });
  });
});
