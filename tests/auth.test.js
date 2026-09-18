const request = require('supertest');
const app = require('../app');
const { db } = require('../firebase');
const bcrypt = require('bcrypt');

jest.mock('../firebase', () => {
  return {
    db: {
      collection: jest.fn()
    }
  };
});

describe('Auth API', () => {
  let mockWhere, mockGet, mockAdd;

  beforeEach(() => {
    mockGet = jest.fn();
    mockWhere = jest.fn().mockReturnValue({ get: mockGet });
    mockAdd = jest.fn();

    db.collection.mockReturnValue({
      where: mockWhere,
      add: mockAdd
    });
    
    jest.clearAllMocks();
  });

  describe('POST /api/v1/auth/register/send-otp', () => {
    it('should send OTP and return 200', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register/send-otp')
        .send({ telefon: '05554443322' });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'OTP sent successfully');
    });

    it('should return 400 if telefon is missing', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register/send-otp')
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Telefon numarası gerekli');
    });
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a user successfully and return 201', async () => {
      // First, send OTP
      await request(app)
        .post('/api/v1/auth/register/send-otp')
        .send({ telefon: '05554443322' });

      // Mock no user exists
      mockGet.mockResolvedValueOnce({ empty: true });
      // Mock user creation
      mockAdd.mockResolvedValueOnce({ id: 'new-user-id' });

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({ 
          email: 'test@test.com', 
          password: 'password123', 
          isim_soyad: 'Test User',
          telefon: '05554443322',
          tc_kimlik: '12345678901',
          otp: '123456',
          role: 'customer' 
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message', 'User created successfully');
      expect(response.body).toHaveProperty('userId', 'new-user-id');
      expect(db.collection).toHaveBeenCalledWith('users');
      expect(mockWhere).toHaveBeenCalledWith('email', '==', 'test@test.com');
      expect(mockAdd).toHaveBeenCalled();
    });

    it('should return 400 for missing data', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'test@test.com', password: 'pass' }); // missing fields

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'All fields are required');
    });

    it('should return 400 for invalid OTP', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({ 
          email: 'test@test.com', 
          password: 'password123', 
          isim_soyad: 'Test User',
          telefon: '05554443322',
          tc_kimlik: '12345678901',
          otp: '999999',
          role: 'customer' 
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Invalid OTP');
    });

    it('should return 400 if user already exists', async () => {
      // First, send OTP
      await request(app)
        .post('/api/v1/auth/register/send-otp')
        .send({ telefon: '05554443322' });

      mockGet.mockResolvedValueOnce({ empty: false }); // User exists

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({ 
          email: 'test@test.com', 
          password: 'password123', 
          isim_soyad: 'Test User',
          telefon: '05554443322',
          tc_kimlik: '12345678901',
          otp: '123456'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'User already exists');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login successfully and return JWT token', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: 'existing-user-id',
            data: () => ({ email: 'test@test.com', password_hash: hashedPassword, role: 'customer' })
          }
        ]
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'test@test.com', password: 'password123' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Login successful');
      expect(response.body).toHaveProperty('token');
    });

    it('should return 401 for invalid password', async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: 'existing-user-id',
            data: () => ({ email: 'test@test.com', password_hash: hashedPassword, role: 'customer' })
          }
        ]
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'test@test.com', password: 'wrongpassword' });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid email or password');
    });

    it('should return 401 for non-existent user', async () => {
      mockGet.mockResolvedValueOnce({ empty: true });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nonexistent@test.com', password: 'password123' });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid email or password');
    });
  });
});
