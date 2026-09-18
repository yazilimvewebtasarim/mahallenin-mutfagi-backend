const request = require('supertest');
const app = require('../app');

describe('AI API Endpoints', () => {
  it('should detect allergens correctly (Peanuts, Dairy, Gluten)', async () => {
    const res = await request(app)
      .post('/api/v1/ai/detect-allergens')
      .send({ ingredients: ['milk', 'peanuts', 'flour', 'tomato'] });
    expect(res.statusCode).toEqual(200);
    expect(res.body.allergens).toContain('Dairy');
    expect(res.body.allergens).toContain('Peanuts');
    expect(res.body.allergens).toContain('Gluten');
  });

  it('should return 400 if ingredients are not an array', async () => {
    const res = await request(app)
      .post('/api/v1/ai/detect-allergens')
      .send({ ingredients: 'milk' });
    expect(res.statusCode).toEqual(400);
  });

  it('should return food suggestions', async () => {
    const res = await request(app).get('/api/v1/ai/food-suggestions');
    expect(res.statusCode).toEqual(200);
    expect(res.body.suggestions).toBeDefined();
    expect(Array.isArray(res.body.suggestions)).toBe(true);
  });

  it('should return menu suggestions', async () => {
    const res = await request(app).get('/api/v1/ai/menu-suggestions');
    expect(res.statusCode).toEqual(200);
    expect(res.body.suggestions).toBeDefined();
    expect(Array.isArray(res.body.suggestions)).toBe(true);
  });
});
