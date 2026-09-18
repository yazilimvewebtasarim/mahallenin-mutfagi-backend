const request = require('supertest');
const app = require('../app');
const { db } = require('../firebase');

jest.mock('../firebase', () => ({
  db: {
    collection: jest.fn(),
    batch: jest.fn()
  }
}));

describe('Chef Subscription API', () => {
  let mockDoc, mockGet, mockUpdate, mockWhere, mockBatch, mockCommit, mockForEach;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGet = jest.fn();
    mockUpdate = jest.fn();
    mockWhere = jest.fn().mockReturnThis();
    mockCommit = jest.fn();
    mockForEach = jest.fn();

    mockDoc = jest.fn(() => ({
      get: mockGet,
      update: mockUpdate,
      ref: { id: 'some-doc-id' }
    }));

    db.collection.mockReturnValue({
      doc: mockDoc,
      where: mockWhere,
      get: mockGet
    });
    
    mockBatch = {
      update: jest.fn(),
      commit: mockCommit
    };
    db.batch.mockReturnValue(mockBatch);
  });

  describe('GET /api/v1/chef/subscription/status', () => {
    it('should return 400 if chefId is missing', async () => {
      const res = await request(app).get('/api/v1/chef/subscription/status');
      expect(res.status).toBe(400);
    });

    it('should return 404 if chef not found', async () => {
      mockGet.mockResolvedValueOnce({ exists: false });
      const res = await request(app).get('/api/v1/chef/subscription/status?chefId=chef1');
      expect(res.status).toBe(404);
    });

    it('should return subscription status', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ orderCount: 5, paidOrderLimit: 10, isVisible: true })
      });

      const res = await request(app).get('/api/v1/chef/subscription/status?chefId=chef1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.orderCount).toBe(5);
      expect(res.body.paidOrderLimit).toBe(10);
      expect(res.body.isVisible).toBe(true);
      expect(res.body.iban).toBeDefined();
    });
  });

  describe('POST /api/v1/chef/subscription/notify-payment', () => {
    it('should return 400 if chefId is missing', async () => {
      const res = await request(app).post('/api/v1/chef/subscription/notify-payment').send({});
      expect(res.status).toBe(400);
    });

    it('should return 404 if chef not found', async () => {
      mockGet.mockResolvedValueOnce({ exists: false });
      const res = await request(app).post('/api/v1/chef/subscription/notify-payment').send({ chefId: 'chef1' });
      expect(res.status).toBe(404);
    });

    it('should update limits and visibility with default 10', async () => {
      mockGet
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({ orderCount: 10, paidOrderLimit: 10, isVisible: false })
        })
        .mockResolvedValueOnce({
          forEach: (cb) => {
             cb({ ref: { id: 'food1' } });
          }
        });

      const res = await request(app).post('/api/v1/chef/subscription/notify-payment').send({ chefId: 'chef1' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      
      expect(mockUpdate).toHaveBeenCalledWith({
        paidOrderLimit: 20,
        isVisible: true
      });
    });

    it('should update limits with rights=100', async () => {
      mockGet
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({ orderCount: 10, paidOrderLimit: 10, isVisible: false })
        })
        .mockResolvedValueOnce({
          forEach: (cb) => {
             cb({ ref: { id: 'food1' } });
          }
        });

      const res = await request(app).post('/api/v1/chef/subscription/notify-payment').send({ chefId: 'chef1', rights: 100 });
      expect(res.status).toBe(200);
      
      expect(mockUpdate).toHaveBeenCalledWith({
        paidOrderLimit: 110,
        isVisible: true
      });
    });
  });
});
