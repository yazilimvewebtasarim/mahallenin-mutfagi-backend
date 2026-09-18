const request = require('supertest');
const app = require('../app');
const { db } = require('../firebase');

jest.mock('../firebase', () => ({
  db: {
    collection: jest.fn()
  }
}));

describe('Stories API', () => {
  let mockGet, mockWhere;

  beforeEach(() => {
    mockGet = jest.fn();
    mockWhere = jest.fn().mockReturnValue({ get: mockGet });

    db.collection.mockReturnValue({
      where: mockWhere
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/stories', () => {
    it('should return active stories', async () => {
      const mockDocs = [
        { id: 's1', data: () => ({ title: 'Story 1' }) },
        { id: 's2', data: () => ({ title: 'Story 2' }) }
      ];
      mockGet.mockResolvedValueOnce(mockDocs);

      const res = await request(app).get('/api/v1/stories');
      expect(res.status).toBe(200);
      expect(res.body.stories).toHaveLength(2);
      expect(res.body.stories[0].id).toBe('s1');
      expect(mockWhere).toHaveBeenCalledWith('active', '==', true);
    });

    it('should handle internal errors', async () => {
      mockGet.mockRejectedValueOnce(new Error('DB Error'));
      const res = await request(app).get('/api/v1/stories');
      expect(res.status).toBe(500);
    });
  });
});
