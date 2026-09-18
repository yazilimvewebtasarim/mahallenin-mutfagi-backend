const request = require('supertest');
const app = require('../app');
const { db } = require('../firebase');

jest.mock('../firebase', () => ({
  db: {
    collection: jest.fn()
  }
}));

describe('Payments API', () => {
  let mockGet, mockUpdate;

  beforeEach(() => {
    mockGet = jest.fn();
    mockUpdate = jest.fn();

    const mockDoc = jest.fn().mockReturnValue({
      get: mockGet,
      update: mockUpdate
    });

    db.collection.mockReturnValue({
      doc: mockDoc
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/payment/create-cash', () => {
    it('should fail if orderId is missing', async () => {
      const res = await request(app).post('/api/v1/payment/create-cash').send({});
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should fail if order is not found', async () => {
      mockGet.mockResolvedValueOnce({ exists: false });
      const res = await request(app).post('/api/v1/payment/create-cash').send({ orderId: 'o1' });
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should success on cash payment', async () => {
      mockGet.mockResolvedValueOnce({ exists: true });
      mockUpdate.mockResolvedValueOnce();

      const res = await request(app).post('/api/v1/payment/create-cash').send({ orderId: 'o1' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith({
        paymentMethod: 'cash',
        paymentStatus: 'pending'
      });
    });

    it('should handle internal errors', async () => {
      mockGet.mockRejectedValueOnce(new Error('DB Error'));
      const res = await request(app).post('/api/v1/payment/create-cash').send({ orderId: 'o1' });
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/payment/checkout-form/init', () => {
    it('should fail if orderId or amount is missing', async () => {
      let res = await request(app).post('/api/v1/payment/checkout-form/init').send({ amount: 100 });
      expect(res.status).toBe(400);

      res = await request(app).post('/api/v1/payment/checkout-form/init').send({ orderId: 'o1' });
      expect(res.status).toBe(400);
    });

    it('should fail if order is not found', async () => {
      mockGet.mockResolvedValueOnce({ exists: false });
      const res = await request(app).post('/api/v1/payment/checkout-form/init').send({ orderId: 'o1', amount: 100 });
      expect(res.status).toBe(404);
    });

    it('should success on checkout form init', async () => {
      mockGet.mockResolvedValueOnce({ exists: true });
      mockUpdate.mockResolvedValueOnce();

      const res = await request(app).post('/api/v1/payment/checkout-form/init').send({ orderId: 'o1', amount: 100 });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.paymentPageUrl).toContain('iyzipay');
      expect(res.body.token).toBe('mock_token_o1');
      expect(mockUpdate).toHaveBeenCalledWith({
        paymentMethod: 'credit_card',
        paymentStatus: 'initiated'
      });
    });

    it('should handle internal errors', async () => {
      mockGet.mockRejectedValueOnce(new Error('DB Error'));
      const res = await request(app).post('/api/v1/payment/checkout-form/init').send({ orderId: 'o1', amount: 100 });
      expect(res.status).toBe(500);
    });
  });
});
