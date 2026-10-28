import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { RazorpayGateway } from '../../modules/gateways/razorpay.gateway.js';
import { env } from '../../config/env.js';

describe('T08/T09 - Webhook Signature Verification Unit Tests', () => {
  const adapter = new RazorpayGateway();

  it('verifies valid HMAC SHA-256 signature against raw body bytes', () => {
    const payload = JSON.stringify({
      id: 'evt_test_12345',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_test_98765',
            order_id: 'order_test_45678',
            amount: 49900,
            currency: 'INR',
            notes: { payroute_transaction_id: 'tx_01H8X7TEST0000000000000000' }
          }
        }
      }
    });

    const rawBody = Buffer.from(payload, 'utf8');
    const validSignature = crypto
      .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    const result = adapter.verifyWebhook(rawBody, {
      'x-razorpay-signature': validSignature,
      'x-razorpay-event-id': 'evt_test_12345'
    });

    expect(result.gateway).toBe('razorpay');
    expect(result.eventId).toBe('evt_test_12345');
    expect(result.eventType).toBe('payment.captured');
    expect(result.rawBodyHash).toBe(crypto.createHash('sha256').update(rawBody).digest('hex'));
  });

  it('rejects tampered or invalid webhook signature', () => {
    const rawBody = Buffer.from(JSON.stringify({ event: 'payment.failed' }), 'utf8');
    const invalidSignature = 'deadbeef0000111122223333444455556666777788889999aaaabbbbccccdddd';

    expect(() =>
      adapter.verifyWebhook(rawBody, {
        'x-razorpay-signature': invalidSignature,
      })
    ).toThrow();
  });

  it('rejects request missing signature header with 400 AUTH error', () => {
    const rawBody = Buffer.from('{}', 'utf8');
    try {
      adapter.verifyWebhook(rawBody, {});
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.kind).toBe('AUTH');
      expect(err.httpStatus).toBe(400);
    }
  });
});
