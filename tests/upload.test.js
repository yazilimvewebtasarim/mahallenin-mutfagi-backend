const request = require('supertest');
const app = require('../app');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const { JWT_SECRET } = require('../middleware/auth');
const token = jwt.sign({ userId: 'test-chef-123', email: 'chef@test.com', role: 'chef' }, JWT_SECRET);

describe('Upload API (/api/v1/upload)', () => {
  const dummyImagePath = path.join(__dirname, 'test_image.png');

  beforeAll(() => {
    // 1x1 transparent PNG buffer
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );
    fs.writeFileSync(dummyImagePath, pngBuffer);
  });

  afterAll(() => {
    if (fs.existsSync(dummyImagePath)) {
      fs.unlinkSync(dummyImagePath);
    }
  });

  test('should return 401 if unauthenticated', async () => {
    const res = await request(app)
      .post('/api/v1/upload')
      .attach('file', dummyImagePath);

    expect(res.statusCode).toBe(401);
  });

  test('should return 400 if no file is sent', async () => {
    const res = await request(app)
      .post('/api/v1/upload')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('should successfully upload an image and return a public URL', async () => {
    const res = await request(app)
      .post('/api/v1/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('folder', 'foods')
      .attach('file', dummyImagePath);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.url).toBeDefined();
    expect(res.body.url).toMatch(/\/uploads\/foods\/\d+_[a-z0-9]+\.png$/);
  });
});
