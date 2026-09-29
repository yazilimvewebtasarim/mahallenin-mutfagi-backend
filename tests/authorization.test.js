const request = require('supertest');
const app = require('../app');
const { db } = require('../firebase');
const { getCustomerToken, getChefToken } = require('./test_helpers');

jest.mock('../firebase', () => ({
  db: {
    collection: jest.fn(),
    batch: jest.fn(),
    runTransaction: jest.fn()
  }
}));

describe('Comprehensive Security & Authorization Suite', () => {
  let mockGet, mockDoc, mockUpdate, mockDelete, mockWhere;
  const chefToken1 = getChefToken('chef_1');
  const chefToken2 = getChefToken('chef_2');
  const customerToken1 = getCustomerToken('customer_1');
  const customerToken2 = getCustomerToken('customer_2');

  beforeEach(() => {
    mockGet = jest.fn();
    mockUpdate = jest.fn();
    mockDelete = jest.fn();

    mockDoc = jest.fn().mockReturnValue({
      id: 'doc_id',
      get: mockGet,
      update: mockUpdate,
      delete: mockDelete
    });

    mockWhere = jest.fn().mockReturnValue({
      get: mockGet,
      where: mockWhere,
      orderBy: jest.fn().mockReturnValue({ get: mockGet })
    });

    db.collection.mockReturnValue({
      doc: mockDoc,
      where: mockWhere
    });

    jest.clearAllMocks();
  });

  describe('Unauthenticated Access (401)', () => {
    it('rejects POST /api/v1/chef/foods without token', async () => {
      const res = await request(app).post('/api/v1/chef/foods').send({});
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authorization');
    });

    it('rejects POST /api/v1/orders without token', async () => {
      const res = await request(app).post('/api/v1/orders').send({});
      expect(res.status).toBe(401);
    });

    it('rejects GET /api/v1/chef/orders without token', async () => {
      const res = await request(app).get('/api/v1/chef/orders');
      expect(res.status).toBe(401);
    });

    it('rejects POST /api/v1/chef/finance/withdraw without token', async () => {
      const res = await request(app).post('/api/v1/chef/finance/withdraw').send({});
      expect(res.status).toBe(401);
    });

    it('rejects POST /api/v1/payment/create-cash without token', async () => {
      const res = await request(app).post('/api/v1/payment/create-cash').send({});
      expect(res.status).toBe(401);
    });

    it('rejects POST /api/v1/reviews without token', async () => {
      const res = await request(app).post('/api/v1/reviews').send({});
      expect(res.status).toBe(401);
    });

    it('rejects PATCH /api/v1/auth/profile without token', async () => {
      const res = await request(app).patch('/api/v1/auth/profile').send({});
      expect(res.status).toBe(401);
    });
  });

  describe('Role-Based Access Control (403)', () => {
    it('prevents customer from posting foods', async () => {
      const res = await request(app)
        .post('/api/v1/chef/foods')
        .set('Authorization', `Bearer ${customerToken1}`)
        .send({ isim: 'Test' });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/permissions/i);
    });

    it('prevents chef from creating customer orders', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${chefToken1}`)
        .send({ items: [] });
      expect(res.status).toBe(403);
    });

    it('prevents customer from accessing chef orders', async () => {
      const res = await request(app)
        .get('/api/v1/chef/orders')
        .set('Authorization', `Bearer ${customerToken1}`);
      expect(res.status).toBe(403);
    });

    it('prevents chef from creating reviews', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${chefToken1}`)
        .send({ orderId: 'o1', rating: 5 });
      expect(res.status).toBe(403);
    });
  });

  describe('Resource Ownership Enforcement (403)', () => {
    it('prevents chef from updating another chef food', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ chefId: 'chef_2' })
      });

      const res = await request(app)
        .put('/api/v1/chef/foods/food_123')
        .set('Authorization', `Bearer ${chefToken1}`)
        .send({ isim: 'Hacked Food' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/güncelleyemezsiniz/i);
    });

    it('prevents chef from deleting another chef food', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ chefId: 'chef_2' })
      });

      const res = await request(app)
        .delete('/api/v1/chef/foods/food_123')
        .set('Authorization', `Bearer ${chefToken1}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/silemezsiniz/i);
    });

    it('prevents chef from updating order status of another chef', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ chefId: 'chef_2', status: 'pending' })
      });

      const res = await request(app)
        .put('/api/v1/chef/orders/o_123/status')
        .set('Authorization', `Bearer ${chefToken1}`)
        .send({ status: 'preparing' });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/another chef/i);
    });

    it('prevents customer from setting cash payment for another customer order', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ customerId: 'customer_2', status: 'pending' })
      });

      const res = await request(app)
        .post('/api/v1/payment/create-cash')
        .set('Authorization', `Bearer ${customerToken1}`)
        .send({ orderId: 'o_123' });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/not own/i);
    });

    it('prevents customer from reviewing an order they did not make', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ customerId: 'customer_2', chefId: 'chef_1', status: 'completed' })
      });

      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', `Bearer ${customerToken1}`)
        .send({ orderId: 'o_123', rating: 5 });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/own orders/i);
    });
  });
});
