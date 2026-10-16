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

describe('Argon + Opus 5.5 Audit Fixes Verification', () => {
  let mockGet, mockSet, mockUpdate, mockDelete, mockDoc, mockWhere, mockBatchUpdate, mockBatchSet, mockBatchCommit;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGet = jest.fn();
    mockSet = jest.fn().mockResolvedValue();
    mockUpdate = jest.fn().mockResolvedValue();
    mockDelete = jest.fn().mockResolvedValue();
    mockWhere = jest.fn().mockReturnValue({ get: mockGet });
    mockDoc = jest.fn().mockImplementation((id) => ({
      id: id || 'generated-doc-id',
      get: mockGet,
      set: mockSet,
      update: mockUpdate,
      delete: mockDelete,
      ref: { id: id || 'generated-doc-id' }
    }));

    mockBatchUpdate = jest.fn();
    mockBatchSet = jest.fn();
    mockBatchCommit = jest.fn().mockResolvedValue();

    db.batch.mockReturnValue({
      update: mockBatchUpdate,
      set: mockBatchSet,
      commit: mockBatchCommit
    });

    db.collection.mockReturnValue({
      doc: mockDoc,
      where: mockWhere
    });
  });

  describe('CRITICAL-1: Path Traversal Protection on /api/v1/files/:file', () => {
    it('rejects encoded path traversal attempts', async () => {
      const res = await request(app).get('/api/v1/files/..%2Fpackage.json');
      expect(res.status).toBe(400);
    });

    it('rejects filenames containing .. or invalid characters', async () => {
      const res = await request(app).get('/api/v1/files/..secret.json');
      expect(res.status).toBe(400);
    });
  });

  describe('CRITICAL-2 & HIGH-5: Order Extra Price Validation & Multi-Variant Stock Aggregation', () => {
    const customerToken = getCustomerToken('cust-1');

    it('rejects negative extra prices (price manipulation exploit)', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          isim: 'Mantı',
          fiyat: 150,
          porsiyon_stok: 10,
          chefId: 'chef-1'
        })
      });

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [
            {
              foodId: 'food-1',
              quantity: 1,
              selectedExtras: [{ name: 'Hack Discount', price: -140 }]
            }
          ]
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Extra price/i);
    });

    it('rejects unapproved extra names when food defines ekstralar whitelist', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          isim: 'Mantı',
          fiyat: 150,
          porsiyon_stok: 10,
          chefId: 'chef-1',
          ekstralar: [{ name: 'Yoğurt', price: 20 }]
        })
      });

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [
            {
              foodId: 'food-1',
              quantity: 1,
              selectedExtras: [{ name: 'Bedava Ekstra', price: 0 }]
            }
          ]
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid extra option/i);
    });

    it('aggregates stock across multiple cart lines of the same foodId', async () => {
      mockGet
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({
            isim: 'Karnıyarık',
            fiyat: 100,
            porsiyon_stok: 3,
            chefId: 'chef-1'
          })
        })
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({
            isim: 'Karnıyarık',
            fiyat: 100,
            porsiyon_stok: 3,
            chefId: 'chef-1'
          })
        });

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [
            { foodId: 'food-1', quantity: 2, note: 'Acılı' },
            { foodId: 'food-1', quantity: 2, note: 'Acısız' }
          ]
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Insufficient stock/i);
    });
  });

  describe('CRITICAL-4: Chef Order Completion Double-Credit Prevention', () => {
    const chefToken = getChefToken('chef-1');

    it('does not credit chef wallet a second time if order is already completed/credited', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          chefId: 'chef-1',
          customerId: 'cust-1',
          status: 'completed',
          isCredited: true,
          total: 250
        })
      });

      const res = await request(app)
        .put('/api/v1/chef/orders/order-123/status')
        .set('Authorization', `Bearer ${chefToken}`)
        .send({ status: 'completed' });

      expect(res.status).toBe(200);
      expect(db.runTransaction).not.toHaveBeenCalled();
    });
  });

  describe('HIGH-6 & Customer Order Cancellation: Stock Restoration', () => {
    const customerToken = getCustomerToken('cust-1');

    it('allows customer to cancel a pending order and restores food stock', async () => {
      mockGet
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({
            id: 'order-1',
            customerId: 'cust-1',
            chefId: 'chef-1',
            status: 'pending',
            items: [{ foodId: 'food-1', quantity: 2 }]
          })
        })
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({
            isim: 'Mantı',
            porsiyon_stok: 5
          })
        });

      const res = await request(app)
        .put('/api/v1/orders/order-1/cancel')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('cancelled');
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ porsiyon_stok: 7 }));
    });
  });
});
