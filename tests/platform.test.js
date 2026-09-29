const request = require('supertest');
const app = require('../app');
const { db } = require('../firebase');

jest.mock('../firebase', () => {
  return {
    db: {
      collection: jest.fn()
    }
  };
});

describe('Platform Stats API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return platform stats with counts', async () => {
    const mockChefsSnap = {
      size: 5,
      docs: [
        { data: () => ({ sehir: 'İstanbul' }) },
        { data: () => ({ sehir: 'Ankara' }) }
      ]
    };
    const mockCustomersSnap = { size: 10, docs: [] };
    const mockOrdersSnap = { size: 25, docs: [] };

    db.collection.mockImplementation((col) => {
      if (col === 'users') {
        return {
          where: jest.fn().mockImplementation((field, op, val) => {
            if (val === 'chef') {
              return {
                where: jest.fn().mockReturnValue({
                  get: jest.fn().mockResolvedValue(mockChefsSnap)
                })
              };
            }
            if (val === 'customer') {
              return {
                get: jest.fn().mockResolvedValue(mockCustomersSnap)
              };
            }
            return { get: jest.fn().mockResolvedValue({ size: 0, docs: [] }) };
          })
        };
      }
      if (col === 'orders') {
        return {
          get: jest.fn().mockResolvedValue(mockOrdersSnap)
        };
      }
      return { get: jest.fn().mockResolvedValue({ size: 0, docs: [] }) };
    });

    const response = await request(app).get('/api/v1/platform/stats');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('totalChefs');
    expect(response.body.data).toHaveProperty('totalCustomers');
    expect(response.body.data).toHaveProperty('totalCities');
  });
});
