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

describe('Custom Food Requests & Bidding Suite', () => {
  let mockGet, mockDoc, mockUpdate, mockSet, mockAdd, mockWhere;
  const chefToken = getChefToken('chef_1');
  const customerToken = getCustomerToken('customer_1');
  const otherCustomerToken = getCustomerToken('customer_2');

  beforeEach(() => {
    mockGet = jest.fn();
    mockUpdate = jest.fn().mockResolvedValue();
    mockSet = jest.fn().mockResolvedValue();
    mockAdd = jest.fn().mockResolvedValue({ id: 'req_123' });

    mockDoc = jest.fn().mockReturnValue({
      id: 'mock_doc_id',
      get: mockGet,
      update: mockUpdate,
      set: mockSet
    });

    mockWhere = jest.fn().mockReturnValue({
      get: mockGet,
      where: mockWhere,
      orderBy: jest.fn().mockReturnValue({ get: mockGet })
    });

    db.collection.mockReturnValue({
      doc: mockDoc,
      where: mockWhere,
      add: mockAdd
    });

    jest.clearAllMocks();
  });

  describe('Customer Requests', () => {
    it('creates custom request successfully', async () => {
      const res = await request(app)
        .post('/api/v1/customer/requests')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          title: 'Glutensiz Mantı',
          description: 'Çölyak hastasıyım, mısır unundan mantı istiyorum',
          budget: 350
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(mockAdd).toHaveBeenCalled();
    });

    it('rejects custom request creation without required fields', async () => {
      const res = await request(app)
        .post('/api/v1/customer/requests')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ budget: 350 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('lists customer requests', async () => {
      mockGet.mockResolvedValueOnce({
        docs: [
          { id: 'req_1', data: () => ({ title: 'Mantı', customerId: 'customer_1', status: 'open', bids: [] }) }
        ]
      });

      const res = await request(app)
        .get('/api/v1/customer/requests')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(1);
    });

    it('accepts bid and creates order', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          customerId: 'customer_1',
          title: 'Diyet Pasta',
          description: 'Şekersiz',
          status: 'open',
          bids: [
            { chefId: 'chef_1', chefName: 'Ayşe Hanım', price: 200, note: 'Tam buğday unlu' }
          ]
        })
      });

      const res = await request(app)
        .post('/api/v1/customer/requests/req_1/accept-bid')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ chefId: 'chef_1' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.orderId).toBeDefined();
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'accepted' }));
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
        chefId: 'chef_1',
        customerId: 'customer_1',
        isCustomRequest: true,
        status: 'pending'
      }));
    });

    it('rejects accepting bid by another customer', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          customerId: 'customer_1',
          status: 'open',
          bids: [{ chefId: 'chef_1', price: 200 }]
        })
      });

      const res = await request(app)
        .post('/api/v1/customer/requests/req_1/accept-bid')
        .set('Authorization', `Bearer ${otherCustomerToken}`)
        .send({ chefId: 'chef_1' });

      expect(res.status).toBe(403);
    });
  });

  describe('Chef Requests & Bidding', () => {
    it('allows chef to browse open requests', async () => {
      mockGet.mockResolvedValueOnce({
        docs: [
          { id: 'req_1', data: () => ({ title: 'Mantı', status: 'open', targetChefId: null }) }
        ]
      });

      const res = await request(app)
        .get('/api/v1/chef/requests')
        .set('Authorization', `Bearer ${chefToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
    });

    it('allows chef to submit bid', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          title: 'Mantı',
          status: 'open',
          bids: []
        })
      }).mockResolvedValueOnce({
        exists: true,
        data: () => ({ name: 'Şef Ahmet' })
      });

      const res = await request(app)
        .post('/api/v1/chef/requests/req_1/bid')
        .set('Authorization', `Bearer ${chefToken}`)
        .send({ price: 250, note: 'Tereyağlı ve soslu teslim edebilirim' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        bids: expect.arrayContaining([
          expect.objectContaining({ chefId: 'chef_1', price: 250 })
        ])
      }));
    });
  });
});
