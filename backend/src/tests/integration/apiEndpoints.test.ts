import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../app.js';
import { connectMongo, closeMongo } from '../../infra/mongo.js';
import { closeRedisConnections } from '../../infra/redis.js';
import { signAdminToken } from '../../modules/auth/jwt.js';

describe('T11/T12 - Express API Endpoints & Security Integration Tests', () => {
  const app = createApp();
  let adminToken: string;

  beforeAll(async () => {
    await connectMongo();
    const tokenObj = signAdminToken({
      sub: 'usr_01H8X700000000000000000000',
      email: 'admin@example.com',
      name: 'PayRoute Admin',
    });
    adminToken = tokenObj.token;
  }, 15000);

  afterAll(async () => {
    await closeMongo();
    await closeRedisConnections();
  });

  it('GET /api/health returns 200 OK without authentication', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('POST /api/payments rejects request missing authentication with 401', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('Idempotency-Key', 'test-key-12345678')
      .send({
        amount: 5000,
        currency: 'inr',
        customer: { reference: 'cust_001' },
        paymentMethod: { type: 'test_token' },
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.category).toBe('authentication');
  });

  it('POST /api/payments rejects authenticated request missing Idempotency-Key header with 400', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: 5000,
        currency: 'inr',
        customer: { reference: 'cust_001' },
        paymentMethod: { type: 'test_token' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('POST /api/auth/login rejects unknown or invalid credentials with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'nonexistent@example.com',
        password: 'wrongpassword123',
      });

    expect(res.status).toBe(401);
    expect(res.body.error.category).toBe('authentication');
  });

  it('POST /api/webhooks/razorpay rejects request missing signature with 400', async () => {
    const res = await request(app)
      .post('/api/webhooks/razorpay')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ event: 'payment.captured' }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('AUTH_ERROR');
  });

  it('POST /api/webhooks/stripe rejects request missing signature with 400', async () => {
    const res = await request(app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ type: 'payment_intent.succeeded' }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('AUTH_ERROR');
  });

  it('GET /nonexistent returns standardized 404 endpoint not found envelope', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ENDPOINT_NOT_FOUND');
    expect(res.body.error.requestId).toBeDefined();
  });
});
