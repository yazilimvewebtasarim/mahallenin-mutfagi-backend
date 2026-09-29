const request = require('supertest');
const app = require('../app');
const { db } = require('../firebase');
const { getChefToken, getCustomerToken } = require('./test_helpers');

jest.mock('../firebase', () => ({
  db: {
    collection: jest.fn(),
    runTransaction: jest.fn()
  }
}));

describe('Finance API', () => {
  let mockGet, mockUpdate, mockSet, mockDoc;
  const chefToken = getChefToken('c1');
  const customerToken = getCustomerToken('u1');

  beforeEach(() => {
    mockGet = jest.fn();
    mockUpdate = jest.fn();
    mockSet = jest.fn();

    mockDoc = jest.fn().mockReturnValue({
      get: mockGet,
      update: mockUpdate,
      set: mockSet,
      id: 'mockId'
    });

    db.collection.mockReturnValue({
      doc: mockDoc
    });

    db.runTransaction.mockImplementation(async (callback) => {
      const transaction = {
        get: mockGet,
        update: mockUpdate,
        set: mockSet
      };
      return callback(transaction);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/chef/finance/update-iban', () => {
    it('should fail with 401 if unauthenticated', async () => {
      const res = await request(app)
        .post('/api/v1/chef/finance/update-iban')
        .send({ iban: 'TR123' });
      expect(res.status).toBe(401);
    });

    it('should fail with 403 if customer tries to update chef iban', async () => {
      const res = await request(app)
        .post('/api/v1/chef/finance/update-iban')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ iban: 'TR123' });
      expect(res.status).toBe(403);
    });

    it('should fail if iban is missing', async () => {
      const res = await request(app)
        .post('/api/v1/chef/finance/update-iban')
        .set('Authorization', `Bearer ${chefToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('should update IBAN successfully using users collection and authenticated user', async () => {
      mockUpdate.mockResolvedValueOnce();

      const res = await request(app)
        .post('/api/v1/chef/finance/update-iban')
        .set('Authorization', `Bearer ${chefToken}`)
        .send({ iban: 'TR123' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('IBAN updated successfully');
      expect(db.collection).toHaveBeenCalledWith('users');
      expect(mockDoc).toHaveBeenCalledWith('c1');
      expect(mockUpdate).toHaveBeenCalledWith({ iban: 'TR123' });
    });

    it('should handle internal errors', async () => {
      mockUpdate.mockRejectedValueOnce(new Error('DB Error'));
      const res = await request(app)
        .post('/api/v1/chef/finance/update-iban')
        .set('Authorization', `Bearer ${chefToken}`)
        .send({ iban: 'TR123' });
      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/v1/chef/finance/withdraw', () => {
    it('should fail if amount is missing', async () => {
      const res = await request(app)
        .post('/api/v1/chef/finance/withdraw')
        .set('Authorization', `Bearer ${chefToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('should fail if amount is negative or non-number', async () => {
      const res = await request(app)
        .post('/api/v1/chef/finance/withdraw')
        .set('Authorization', `Bearer ${chefToken}`)
        .send({ amount: -50 });
      expect(res.status).toBe(400);
    });

    it('should fail if chef not found', async () => {
      mockGet.mockResolvedValueOnce({ exists: false });
      const res = await request(app)
        .post('/api/v1/chef/finance/withdraw')
        .set('Authorization', `Bearer ${chefToken}`)
        .send({ amount: 100 });
      expect(res.status).toBe(404);
    });

    it('should fail if insufficient funds', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ balance: 50 }) });
      const res = await request(app)
        .post('/api/v1/chef/finance/withdraw')
        .set('Authorization', `Bearer ${chefToken}`)
        .send({ amount: 100 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Insufficient funds');
    });

    it('should request withdrawal atomically using db.runTransaction', async () => {
      mockGet.mockResolvedValue({ exists: true, data: () => ({ balance: 150 }) });
      mockUpdate.mockResolvedValue();
      mockSet.mockResolvedValue();

      const res = await request(app)
        .post('/api/v1/chef/finance/withdraw')
        .set('Authorization', `Bearer ${chefToken}`)
        .send({ amount: 100 });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Withdrawal requested successfully');
      expect(db.runTransaction).toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalledWith(expect.anything(), { balance: 50 });
      expect(mockSet).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        chefId: 'c1',
        amount: 100,
        status: 'pending'
      }));

    });

    it('should handle internal errors', async () => {
      mockGet.mockRejectedValueOnce(new Error('DB Error'));
      const res = await request(app)
        .post('/api/v1/chef/finance/withdraw')
        .set('Authorization', `Bearer ${chefToken}`)
        .send({ amount: 100 });
      expect(res.status).toBe(500);
    });
  });
});
