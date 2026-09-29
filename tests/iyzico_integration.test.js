const request = require('supertest');
const app = require('../app');
const { getChefToken, getCustomerToken } = require('./test_helpers');
const { apiKey, baseUrl } = require('../config/iyzico');

describe('Real Iyzico Integration Test Suite', () => {
  const chefToken = getChefToken('chef_iyzico_test');
  const customerToken = getCustomerToken('customer_iyzico_test');

  it('has valid Iyzico configuration', () => {
    expect(apiKey).toBeDefined();
    expect(baseUrl).toContain('iyzipay.com');
  });

  describe('Chef Subscription Iyzico Checkout', () => {
    it('returns a real checkout payment page URL and token for chef', async () => {
      const res = await request(app)
        .post('/api/v1/chef/subscription/initialize-checkout')
        .set('Authorization', `Bearer ${chefToken}`)
        .send({ rights: 10 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.paymentPageUrl).toContain('iyzipay.com');
      expect(res.body.price).toBe(299);
    });

    it('rejects invalid or missing token on verify-token', async () => {
      const res = await request(app)
        .post('/api/v1/chef/subscription/verify-token')
        .set('Authorization', `Bearer ${chefToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('handles callback gracefully when token is provided', async () => {
      const res = await request(app)
        .post('/api/v1/chef/subscription/iyzico-callback')
        .send({ token: 'sub_test_token_123' });

      expect(res.status).toBe(200);
      expect(res.text).toContain('Ödeme');
    });
  });

  describe('Customer Order Iyzico Checkout', () => {
    it('handles customer checkout callback gracefully', async () => {
      const res = await request(app)
        .post('/api/v1/payment/iyzico-callback')
        .send({ token: 'order_test_token_123' });

      expect(res.status).toBe(200);
      expect(res.text).toContain('Ödeme');
    });
  });
});
