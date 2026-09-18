const request = require('supertest');
const app = require('../app');
const { db } = require('../firebase');

jest.mock('../firebase', () => ({
  db: {
    collection: jest.fn()
  }
}));

describe('Reviews API', () => {
  let mockGet, mockWhere, mockOrderBy, mockSet, mockDoc;

  beforeEach(() => {
    mockGet = jest.fn();
    mockSet = jest.fn();

    mockDoc = jest.fn().mockReturnValue({
      id: 'mock_review_id',
      get: mockGet,
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
      where: mockWhere
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/reviews', () => {
    it('should fail if required fields are missing', async () => {
      const res = await request(app).post('/api/v1/reviews').send({ orderId: 'o1', customerId: 'c1' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should fail if rating is out of bounds', async () => {
      let res = await request(app).post('/api/v1/reviews').send({ orderId: 'o1', customerId: 'c1', chefId: 'chef1', rating: 6 });
      expect(res.status).toBe(400);

      res = await request(app).post('/api/v1/reviews').send({ orderId: 'o1', customerId: 'c1', chefId: 'chef1', rating: 0 });
      expect(res.status).toBe(400);
    });

    it('should fail if order is not found', async () => {
      mockGet.mockResolvedValueOnce({ exists: false }); // order doc
      const res = await request(app).post('/api/v1/reviews').send({ orderId: 'o1', customerId: 'c1', chefId: 'chef1', rating: 5 });
      expect(res.status).toBe(404);
    });

    it('should fail if order is not completed or delivered', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'pending' }) }); // order doc
      const res = await request(app).post('/api/v1/reviews').send({ orderId: 'o1', customerId: 'c1', chefId: 'chef1', rating: 5 });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Can only review completed orders');
    });

    it('should fail if order is already reviewed', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'completed' }) }); // order doc
      mockGet.mockResolvedValueOnce({ empty: false }); // reviews collection where
      const res = await request(app).post('/api/v1/reviews').send({ orderId: 'o1', customerId: 'c1', chefId: 'chef1', rating: 5 });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Order already reviewed');
    });

    it('should create review successfully', async () => {
      mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'delivered' }) }); // order doc
      mockGet.mockResolvedValueOnce({ empty: true }); // reviews collection where
      mockSet.mockResolvedValueOnce();

      const res = await request(app).post('/api/v1/reviews').send({ orderId: 'o1', customerId: 'c1', chefId: 'chef1', rating: 5, comment: 'Great' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rating).toBe(5);
      expect(res.body.data.comment).toBe('Great');
      expect(mockSet).toHaveBeenCalled();
    });

    it('should handle internal errors', async () => {
      mockGet.mockRejectedValueOnce(new Error('DB Error'));
      const res = await request(app).post('/api/v1/reviews').send({ orderId: 'o1', customerId: 'c1', chefId: 'chef1', rating: 5 });
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/v1/reviews/:chefId', () => {
    it('should get reviews for chef', async () => {
      mockGet.mockResolvedValueOnce({
        docs: [
          { data: () => ({ rating: 5 }) },
          { data: () => ({ rating: 4 }) }
        ]
      });

      const res = await request(app).get('/api/v1/reviews/chef1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(2);
      expect(res.body.averageRating).toBe(4.5);
    });

    it('should handle no reviews', async () => {
      mockGet.mockResolvedValueOnce({ docs: [] });

      const res = await request(app).get('/api/v1/reviews/chef1');
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
      expect(res.body.averageRating).toBe(0);
    });

    it('should handle internal errors', async () => {
      mockGet.mockRejectedValueOnce(new Error('DB Error'));
      const res = await request(app).get('/api/v1/reviews/chef1');
      expect(res.status).toBe(500);
    });
  });
});
