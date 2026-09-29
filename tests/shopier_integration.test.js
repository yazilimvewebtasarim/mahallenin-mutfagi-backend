const request = require('supertest');
const app = require('../app');
const { getChefToken, getCustomerToken } = require('./test_helpers');
const { generateShopierPaymentData, verifyShopierCallback } = require('../config/shopier');

describe('Shopier Integration Test Suite', () => {
  const chefToken = getChefToken('chef_shopier_test');
  const customerToken = getCustomerToken('customer_shopier_test');

  it('generates valid Shopier payment data with HMAC signature', () => {
    const data = generateShopierPaymentData({
      orderId: 'test_order_123',
      buyerName: 'Ahmet',
      buyerSurname: 'Yilmaz',
      total: 299,
      callbackUrl: 'https://example.com/callback'
    });

    expect(data.actionUrl).toContain('shopier.com');
    expect(data.formData.signature).toBeDefined();
    expect(data.formData.platform_order_id).toBe('test_order_123');
    expect(data.formData.total_order_value).toBe('299.00');
  });

  describe('Chef Subscription via Shopier', () => {
    it('initializes Shopier checkout with 10 package (299 TL)', async () => {
      const res = await request(app)
        .post('/api/v1/chef/subscription/initialize-shopier')
        .set('Authorization', `Bearer ${chefToken}`)
        .send({ rights: 10 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.provider).toBe('shopier');
      expect(res.body.rights).toBe(10);
      expect(res.body.price).toBe(299);
      expect(res.body.paymentPageUrl).toContain('/shopier-pay/');
      expect(res.body.formData).toBeDefined();
    });

    it('renders auto-submit HTML page on shopier-pay route', async () => {
      const res = await request(app)
        .get('/api/v1/chef/subscription/shopier-pay/shopier_sub_test_123');

      expect(res.status).toBe(200);
      expect(res.text).toContain('Shopier Güvenli Ödeme');
      expect(res.text).toContain('<form id="shopier_form"');
    });

    it('handles Shopier callback and credits chef order limits', async () => {
      const res = await request(app)
        .post('/api/v1/chef/subscription/shopier-callback')
        .send({
          platform_order_id: 'shopier_sub_chef1_123456_10',
          status: 'success',
          random_nr: '123456',
          signature: 'valid_signature'
        });

      expect(res.status).toBe(200);
      expect(res.text).toContain('Shopier Ödemesi Başarılı');
    });
  });

  describe('Customer Order via Shopier', () => {
    it('renders customer shopier auto-redirect page', async () => {
      const res = await request(app)
        .get('/api/v1/payment/shopier-pay/order_dummy_123');

      expect(res.status).toBe(200);
      expect(res.text).toContain('Shopier Güvenli Ödeme');
    });

    it('handles customer Shopier payment callback', async () => {
      const res = await request(app)
        .post('/api/v1/payment/shopier-callback')
        .send({
          platform_order_id: 'order_dummy_123',
          status: 'success',
          random_nr: '123456',
          signature: 'valid_signature'
        });

      expect(res.status).toBe(200);
      expect(res.text).toContain('Sipariş Ödemesi Başarıyla Alındı');
    });
  });
});
