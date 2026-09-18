const request = require('supertest');
const app = require('../app');
const { db } = require('../firebase');

jest.mock('../firebase', () => ({
  db: {
    collection: jest.fn()
  }
}));

describe('Finance API', () => {
  let mockGet, mockUpdate, mockSet, mockDoc;

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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/chef/finance/update-iban', () => {
    it('should fail if chefId or iban is missing', async () => {
      let res = await request(app).post('/api/v1/chef/finance/update-iban').send({ chefId: 'c1' });
      expect(res.status).toBe(400);

      res = await request(app).post('/api/v1/chef/finance/update-iban').send({ iban: 'TR123' });
      expect(res.status).toBe(400);
    });

    it('should update IBAN successfully', async () => {
      mockUpdate.mockResolvedValueOnce();

      const res = await request(app).post('/api/v1/chef/finance/update-iban').send({ chefId: 'c1', iban: 'TR123' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('IBAN updated successfully');
      expect(mockUpdate).toHaveBeenCalledWith({ iban: 'TR123' });
    });

    it('should handle internal errors', async () => {
      mockUpdate.mockRejectedValueOnce(new Error('DB Error'));
      const res = await request(app).post('/api/v1/chef/finance/update-iban').send({ chefId: 'c1', iban: 'TR123' });
      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/v1/chef/finance/withdraw', () => {
    it('should fail if chefId or amount is missing', async () => {
      let res = await request(app).post('/api/v1/chef/finance/withdraw').send({ amount: 100 });
      expect(res.status).toBe(400);
    });

    it('should fail if chef not found', async () => {
      mockGet.mockResolvedValueOnce({ exists: false });
      const res = await request(app).post('/api/v1/chef/finance/withdraw').send({ chefId: 'c1', amount: 100 });
      expect(res.status).toBe(404);
    });

    it('should fail if insufficient funds', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ balance: 50 }) });
      const res = await request(app).post('/api/v1/chef/finance/withdraw').send({ chefId: 'c1', amount: 100 });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Insufficient funds');
    });

    it('should request withdrawal successfully', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ balance: 150 }) });
      mockUpdate.mockResolvedValueOnce();
      mockSet.mockResolvedValueOnce();

      const res = await request(app).post('/api/v1/chef/finance/withdraw').send({ chefId: 'c1', amount: 100 });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Withdrawal requested successfully');
      expect(mockUpdate).toHaveBeenCalledWith({ balance: 50 });
      expect(mockSet).toHaveBeenCalled();
    });

    it('should handle internal errors', async () => {
      mockGet.mockRejectedValueOnce(new Error('DB Error'));
      const res = await request(app).post('/api/v1/chef/finance/withdraw').send({ chefId: 'c1', amount: 100 });
      expect(res.status).toBe(500);
    });
  });
});
