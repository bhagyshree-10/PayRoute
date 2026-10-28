import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { EventEmitter } from 'events';
import * as mongoInfra from '../../infra/mongo.js';
import * as redisInfra from '../../infra/redis.js';
import { env } from '../../config/env.js';
import {
  TARGET_TXN_ID,
  TARGET_ATT_ID,
  TARGET_PI_ID,
  buildSyntheticStripeEvent,
  validatePreDispatchBaselines,
  verifyWebhookOutcome,
  verifyPostDispatchImmutability,
  runTest,
} from '../../scripts/test-webhook-correlation.js';
import { PaymentAttempt, Transaction, WebhookEvent } from '@payroute/shared';

describe('Webhook Correlation Test Suite (Unit & Isolated Mocks)', () => {
  const baseTxn: Transaction = {
    id: TARGET_TXN_ID,
    clientId: 'usr_client_001',
    amount: 632000,
    currency: 'inr',
    status: 'SUCCESS',
    customer: { reference: 'cust_001' },
    paymentMethodType: 'test_token',
    attemptCount: 1,
    retryCount: 0,
    version: 4,
    gatewayReference: TARGET_PI_ID,
    routing: {
      preferredGateway: 'stripe',
      exhaustedGateways: [],
      currentGateway: 'stripe',
      gatewayGenerations: { stripe: 1, razorpay: 1 },
    },
    flags: [],
    timeline: [
      { at: new Date('2026-10-25T13:40:00.000Z'), type: 'transaction.created', detail: { source: 'MERCHANT' } },
      { at: new Date('2026-10-25T13:40:05.000Z'), type: 'payment_attempt.initiated', detail: { source: 'SYSTEM' } },
      { at: new Date('2026-10-25T13:42:30.000Z'), type: 'reconciliation.polled', detail: { source: 'RECONCILIATION' } },
      { at: new Date('2026-10-25T13:42:31.000Z'), type: 'transaction.succeeded', detail: { source: 'RECONCILIATION' } },
    ],
    createdAt: new Date('2026-10-25T13:40:00.000Z'),
    updatedAt: new Date('2026-10-25T13:42:31.000Z'),
  };

  const baseAttempt: PaymentAttempt = {
    id: TARGET_ATT_ID,
    transactionId: TARGET_TXN_ID,
    attemptNumber: 1,
    gateway: 'stripe',
    status: 'SUCCEEDED',
    gatewayIdempotencyKey: `pr_${TARGET_TXN_ID}_stripe_g1`,
    gatewayReference: TARGET_PI_ID,
    routingDecision: { strategy: 'deterministic-v1', selected: 'stripe', reason: 'PRIMARY', considered: [], decidedAt: new Date('2026-10-25T13:40:05.000Z') },
    isProbe: false,
    latencyMs: 1637,
    startedAt: new Date('2026-10-25T13:40:05.000Z'),
    createdAt: new Date('2026-10-25T13:40:05.000Z'),
    finishedAt: new Date('2026-10-25T13:42:31.000Z'),
  };

  describe('buildSyntheticStripeEvent', () => {
    it('constructs a valid Stripe payment_intent.succeeded payload', () => {
      const event = buildSyntheticStripeEvent('evt_test_123', TARGET_TXN_ID, TARGET_PI_ID);
      expect(event.id).toBe('evt_test_123');
      expect(event.type).toBe('payment_intent.succeeded');
      expect(event.data.object.id).toBe(TARGET_PI_ID);
      expect(event.data.object.status).toBe('succeeded');
      expect(event.data.object.metadata.payroute_transaction_id).toBe(TARGET_TXN_ID);
      expect(event.data.object.amount).toBe(632000);
      expect(event.data.object.currency).toBe('inr');
      expect(typeof event.created).toBe('number');
    });
  });

  describe('validatePreDispatchBaselines', () => {
    it('passes when transaction and attempt match all expected preconditions', () => {
      expect(() =>
        validatePreDispatchBaselines(baseTxn, baseAttempt, TARGET_PI_ID)
      ).not.toThrow();
    });

    it('throws if transaction is null', () => {
      expect(() =>
        validatePreDispatchBaselines(null, baseAttempt, TARGET_PI_ID)
      ).toThrow('Target transaction not found in database');
    });

    it('throws if transaction status is not SUCCESS', () => {
      const invalid = { ...baseTxn, status: 'PENDING' as any };
      expect(() =>
        validatePreDispatchBaselines(invalid, baseAttempt, TARGET_PI_ID)
      ).toThrow('Transaction status is "PENDING", expected "SUCCESS"');
    });

    it('throws if transaction attemptCount is not 1', () => {
      const invalid = { ...baseTxn, attemptCount: 0 };
      expect(() =>
        validatePreDispatchBaselines(invalid, baseAttempt, TARGET_PI_ID)
      ).toThrow('Transaction attemptCount is 0, expected 1');
    });

    it('throws if transaction retryCount is not 0', () => {
      const invalid = { ...baseTxn, retryCount: 1 };
      expect(() =>
        validatePreDispatchBaselines(invalid, baseAttempt, TARGET_PI_ID)
      ).toThrow('Transaction retryCount is 1, expected 0');
    });

    it('throws if transaction version is not 4', () => {
      const invalid = { ...baseTxn, version: 3 };
      expect(() =>
        validatePreDispatchBaselines(invalid, baseAttempt, TARGET_PI_ID)
      ).toThrow('Transaction version is 3, expected 4');
    });

    it('throws if transaction gatewayReference does not match expected PI', () => {
      const invalid = { ...baseTxn, gatewayReference: 'pi_different' };
      expect(() =>
        validatePreDispatchBaselines(invalid, baseAttempt, TARGET_PI_ID)
      ).toThrow('expected "pi_3UU8NRF8v6d32i831EjFW6os"');
    });

    it('throws if attempt is null', () => {
      expect(() =>
        validatePreDispatchBaselines(baseTxn, null, TARGET_PI_ID)
      ).toThrow('Target PaymentAttempt not found in database');
    });

    it('throws if attempt status is not SUCCEEDED', () => {
      const invalid = { ...baseAttempt, status: 'STARTED' as any };
      expect(() =>
        validatePreDispatchBaselines(baseTxn, invalid, TARGET_PI_ID)
      ).toThrow('Attempt status is "STARTED", expected "SUCCEEDED"');
    });

    it('throws if attempt gatewayReference does not match', () => {
      const invalid = { ...baseAttempt, gatewayReference: 'pi_different' };
      expect(() =>
        validatePreDispatchBaselines(baseTxn, invalid, TARGET_PI_ID)
      ).toThrow('Attempt gateway reference is "pi_different"');
    });

    it('throws if attempt latencyMs is not 1637', () => {
      const invalid = { ...baseAttempt, latencyMs: 500 };
      expect(() =>
        validatePreDispatchBaselines(baseTxn, invalid, TARGET_PI_ID)
      ).toThrow('Attempt latencyMs is 500, expected 1637');
    });

    it('throws if attempt finishedAt is missing', () => {
      const invalid = { ...baseAttempt, finishedAt: undefined as any };
      expect(() =>
        validatePreDispatchBaselines(baseTxn, invalid, TARGET_PI_ID)
      ).toThrow('Attempt finishedAt is missing');
    });
  });

  describe('verifyWebhookOutcome', () => {
    const validWebhook: WebhookEvent = {
      id: 'whevt_01test',
      gateway: 'stripe',
      eventId: 'evt_test_corr_123',
      eventType: 'payment_intent.succeeded',
      status: 'PROCESSED',
      transactionId: TARGET_TXN_ID,
      attemptId: TARGET_ATT_ID,
      processingAttempts: 1,
      duplicateCount: 0,
      lastDuplicateAt: null,
      lastError: null,
      rawBodyHash: 'hash123',
      payloadSnapshot: {},
      requestId: 'req_123',
      receivedAt: new Date(),
      enqueuedAt: new Date(),
      processingStartedAt: new Date(),
      processedAt: new Date(),
      failedAt: null,
    };

    it('passes when webhook event doc is PROCESSED and accurately correlated', () => {
      expect(() =>
        verifyWebhookOutcome(validWebhook, 'evt_test_corr_123', TARGET_TXN_ID, TARGET_ATT_ID)
      ).not.toThrow();
    });

    it('throws if webhook doc is null (timed out polling)', () => {
      expect(() =>
        verifyWebhookOutcome(null, 'evt_test_corr_123', TARGET_TXN_ID, TARGET_ATT_ID)
      ).toThrow('Monitoring timed out before webhook reached a terminal state');
    });

    it('throws if eventId does not match', () => {
      expect(() =>
        verifyWebhookOutcome(validWebhook, 'evt_different', TARGET_TXN_ID, TARGET_ATT_ID)
      ).toThrow('Webhook eventId mismatch');
    });

    it('throws if status is not PROCESSED (e.g. FAILED)', () => {
      const failed = { ...validWebhook, status: 'FAILED' as any, lastError: 'Boom' };
      expect(() =>
        verifyWebhookOutcome(failed, 'evt_test_corr_123', TARGET_TXN_ID, TARGET_ATT_ID)
      ).toThrow('Webhook event status is "FAILED", expected "PROCESSED". Error: Boom');
    });

    it('throws if status is ORPHANED', () => {
      const orphaned = { ...validWebhook, status: 'ORPHANED' as any };
      expect(() =>
        verifyWebhookOutcome(orphaned, 'evt_test_corr_123', TARGET_TXN_ID, TARGET_ATT_ID)
      ).toThrow('Webhook event status is "ORPHANED", expected "PROCESSED"');
    });

    it('throws if transactionId does not match target', () => {
      const invalid = { ...validWebhook, transactionId: 'txn_other' };
      expect(() =>
        verifyWebhookOutcome(invalid, 'evt_test_corr_123', TARGET_TXN_ID, TARGET_ATT_ID)
      ).toThrow('Webhook linked transaction is "txn_other"');
    });

    it('throws if attemptId does not match target', () => {
      const invalid = { ...validWebhook, attemptId: 'att_other' };
      expect(() =>
        verifyWebhookOutcome(invalid, 'evt_test_corr_123', TARGET_TXN_ID, TARGET_ATT_ID)
      ).toThrow('Webhook linked attempt is "att_other"');
    });

    it('throws if processingAttempts is not 1', () => {
      const invalid = { ...validWebhook, processingAttempts: 2 };
      expect(() =>
        verifyWebhookOutcome(invalid, 'evt_test_corr_123', TARGET_TXN_ID, TARGET_ATT_ID)
      ).toThrow('Webhook processingAttempts is 2, expected 1');
    });
  });

  describe('verifyPostDispatchImmutability', () => {
    it('passes when post records are identical to pre records', () => {
      expect(() =>
        verifyPostDispatchImmutability(baseTxn, { ...baseTxn }, baseAttempt, { ...baseAttempt }, TARGET_PI_ID)
      ).not.toThrow();
    });

    it('throws if postTxn is missing', () => {
      expect(() =>
        verifyPostDispatchImmutability(baseTxn, null, baseAttempt, baseAttempt, TARGET_PI_ID)
      ).toThrow('Post-check failed: Transaction was deleted or missing');
    });

    it('throws if postTxn id altered', () => {
      const altered = { ...baseTxn, id: 'txn_different' };
      expect(() =>
        verifyPostDispatchImmutability(baseTxn, altered, baseAttempt, baseAttempt, TARGET_PI_ID)
      ).toThrow('Transaction id altered');
    });

    it('throws if postTxn status altered', () => {
      const altered = { ...baseTxn, status: 'FAILED' as any };
      expect(() =>
        verifyPostDispatchImmutability(baseTxn, altered, baseAttempt, baseAttempt, TARGET_PI_ID)
      ).toThrow('Transaction status altered: "FAILED" !== "SUCCESS"');
    });

    it('throws if postTxn attemptCount altered', () => {
      const altered = { ...baseTxn, attemptCount: 2 };
      expect(() =>
        verifyPostDispatchImmutability(baseTxn, altered, baseAttempt, baseAttempt, TARGET_PI_ID)
      ).toThrow('Transaction attemptCount altered: 2 !== 1');
    });

    it('throws if postTxn retryCount altered', () => {
      const altered = { ...baseTxn, retryCount: 1 };
      expect(() =>
        verifyPostDispatchImmutability(baseTxn, altered, baseAttempt, baseAttempt, TARGET_PI_ID)
      ).toThrow('Transaction retryCount altered: 1 !== 0');
    });

    it('throws if postTxn version altered', () => {
      const altered = { ...baseTxn, version: 5 };
      expect(() =>
        verifyPostDispatchImmutability(baseTxn, altered, baseAttempt, baseAttempt, TARGET_PI_ID)
      ).toThrow('Transaction version altered: 5 !== 4');
    });

    it('throws if postTxn gatewayReference altered', () => {
      const altered = { ...baseTxn, gatewayReference: 'pi_altered' };
      expect(() =>
        verifyPostDispatchImmutability(baseTxn, altered, baseAttempt, baseAttempt, TARGET_PI_ID)
      ).toThrow('Transaction gatewayReference altered');
    });

    it('throws if postTxn timeline altered', () => {
      const altered = {
        ...baseTxn,
        timeline: [
          ...baseTxn.timeline,
          { at: new Date(), type: 'extra.event', source: 'WEBHOOK' } as any,
        ],
      };
      expect(() =>
        verifyPostDispatchImmutability(baseTxn, altered, baseAttempt, baseAttempt, TARGET_PI_ID)
      ).toThrow('Transaction timeline contents were unexpectedly modified');
    });

    it('throws if postAtt is missing', () => {
      expect(() =>
        verifyPostDispatchImmutability(baseTxn, baseTxn, baseAttempt, null, TARGET_PI_ID)
      ).toThrow('Post-check failed: PaymentAttempt was deleted or missing');
    });

    it('throws if postAtt id altered', () => {
      const altered = { ...baseAttempt, id: 'att_different' };
      expect(() =>
        verifyPostDispatchImmutability(baseTxn, baseTxn, baseAttempt, altered, TARGET_PI_ID)
      ).toThrow('PaymentAttempt id altered');
    });

    it('throws if postAtt status altered', () => {
      const altered = { ...baseAttempt, status: 'FAILED' as any };
      expect(() =>
        verifyPostDispatchImmutability(baseTxn, baseTxn, baseAttempt, altered, TARGET_PI_ID)
      ).toThrow('PaymentAttempt status altered: "FAILED" !== "SUCCEEDED"');
    });

    it('throws if postAtt gatewayReference altered', () => {
      const altered = { ...baseAttempt, gatewayReference: 'pi_altered' };
      expect(() =>
        verifyPostDispatchImmutability(baseTxn, baseTxn, baseAttempt, altered, TARGET_PI_ID)
      ).toThrow('PaymentAttempt gatewayReference altered');
    });

    it('throws if postAtt latencyMs altered', () => {
      const altered = { ...baseAttempt, latencyMs: 2000 };
      expect(() =>
        verifyPostDispatchImmutability(baseTxn, baseTxn, baseAttempt, altered, TARGET_PI_ID)
      ).toThrow('PaymentAttempt latencyMs altered: 2000 !== 1637');
    });

    it('throws if postAtt finishedAt altered', () => {
      const altered = { ...baseAttempt, finishedAt: new Date('2026-10-26T00:00:00.000Z') };
      expect(() =>
        verifyPostDispatchImmutability(baseTxn, baseTxn, baseAttempt, altered, TARGET_PI_ID)
      ).toThrow('PaymentAttempt finishedAt altered');
    });
  });

  describe('runTest Execution Flow and Safety Guards', () => {
    let mockTxnCollection: any;
    let mockAttemptCollection: any;
    let mockWebhookCollection: any;
    let mockRedis: any;

    beforeEach(() => {
      vi.restoreAllMocks();

      vi.spyOn(mongoInfra, 'connectMongo').mockResolvedValue({} as any);
      vi.spyOn(mongoInfra, 'closeMongo').mockResolvedValue(undefined);
      vi.spyOn(redisInfra, 'closeRedisConnections').mockResolvedValue(undefined);
      vi.spyOn(redisInfra, 'checkRedisHealth').mockResolvedValue({ status: 'OK', pingMs: 5 });

      mockTxnCollection = {
        findOne: vi.fn().mockResolvedValue(baseTxn),
      };
      mockAttemptCollection = {
        findOne: vi.fn().mockResolvedValue(baseAttempt),
      };
      mockWebhookCollection = {
        findOne: vi.fn().mockResolvedValue(null),
      };

      vi.spyOn(mongoInfra.collections, 'transactions').mockReturnValue(mockTxnCollection);
      vi.spyOn(mongoInfra.collections, 'paymentAttempts').mockReturnValue(mockAttemptCollection);
      vi.spyOn(mongoInfra.collections, 'webhookEvents').mockReturnValue(mockWebhookCollection);

      mockRedis = {
        get: vi.fn().mockResolvedValue(new Date().toISOString()),
      };
      vi.spyOn(redisInfra, 'getRedisClient').mockReturnValue(mockRedis);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('aborts immediately if STRIPE_SECRET_KEY is a live key (sk_live_...)', async () => {
      const origKey = env.STRIPE_SECRET_KEY;
      try {
        (env as any).STRIPE_SECRET_KEY = 'sk_live_critical_test';
        await expect(runTest()).rejects.toThrow('CRITICAL SECURITY ABORT: Live Stripe secret key detected');
      } finally {
        (env as any).STRIPE_SECRET_KEY = origKey;
      }
    });

    it('aborts immediately if STRIPE_WEBHOOK_SECRET is empty', async () => {
      const origSecret = env.STRIPE_WEBHOOK_SECRET;
      try {
        (env as any).STRIPE_WEBHOOK_SECRET = '';
        await expect(runTest()).rejects.toThrow('ABORT: STRIPE_WEBHOOK_SECRET is not configured');
      } finally {
        (env as any).STRIPE_WEBHOOK_SECRET = origSecret;
      }
    });

    it('aborts if Redis health check returns DOWN and closes connections', async () => {
      vi.spyOn(redisInfra, 'checkRedisHealth').mockResolvedValue({ status: 'DOWN', pingMs: 50 });
      await expect(runTest()).rejects.toThrow('ABORT: Redis is unreachable');
      expect(mongoInfra.closeMongo).toHaveBeenCalled();
    });

    it('aborts if worker heartbeat is missing', async () => {
      mockRedis.get.mockResolvedValue(null);
      await expect(runTest()).rejects.toThrow('ABORT: Worker heartbeat not found');
      expect(redisInfra.closeRedisConnections).toHaveBeenCalled();
      expect(mongoInfra.closeMongo).toHaveBeenCalled();
    });

    it('aborts if worker heartbeat is older than 20 seconds', async () => {
      const staleDate = new Date(Date.now() - 30000).toISOString();
      mockRedis.get.mockResolvedValue(staleDate);
      await expect(runTest()).rejects.toThrow('ABORT: Worker heartbeat is stale');
    });

    it('aborts if API health check fails on port', async () => {
      vi.spyOn(http, 'get').mockImplementation((_opts: any, _cb: any) => {
        const emitter = new EventEmitter() as any;
        setTimeout(() => emitter.emit('error', new Error('ECONNREFUSED')), 5);
        return emitter;
      });

      await expect(runTest()).rejects.toThrow('ABORT: API server not responding with 200');
    });

    it('aborts if event ID collision is detected in MongoDB', async () => {
      vi.spyOn(http, 'get').mockImplementation((_opts: any, cb: any) => {
        const emitter = new EventEmitter() as any;
        setTimeout(() => cb({ statusCode: 200 }), 5);
        return emitter;
      });

      mockWebhookCollection.findOne.mockResolvedValueOnce({ id: 'existing_evt' });

      await expect(runTest()).rejects.toThrow('ABORT: Event ID collision detected');
    });

    it('handles HTTP timeout: avoids retry, performs DB check, and safely aborts without claiming success', async () => {
      vi.spyOn(http, 'get').mockImplementation((_opts: any, cb: any) => {
        const emitter = new EventEmitter() as any;
        setTimeout(() => cb({ statusCode: 200 }), 5);
        return emitter;
      });

      // Mock http.request timeout
      let requestCount = 0;
      vi.spyOn(http, 'request').mockImplementation((_opts: any, _cb: any) => {
        requestCount++;
        const emitter = new EventEmitter() as any;
        emitter.write = vi.fn();
        emitter.end = vi.fn();
        emitter.destroy = vi.fn();
        setTimeout(() => emitter.emit('timeout'), 10);
        return emitter;
      });

      // Webhook not stored in MongoDB
      mockWebhookCollection.findOne.mockResolvedValue(null);

      await expect(runTest({ pollTimeoutMs: 50, pollIntervalMs: 10 })).rejects.toThrow('Ambiguous dispatch: HTTP request failed (Webhook HTTP request timed out after 5000ms.)');
      // Crucial assertion: never resent the HTTP request
      expect(requestCount).toBe(1);
      expect(redisInfra.closeRedisConnections).toHaveBeenCalled();
      expect(mongoInfra.closeMongo).toHaveBeenCalled();
    });

    it('handles HTTP non-200 response: avoids retry, performs DB check, and safely aborts without claiming success', async () => {
      vi.spyOn(http, 'get').mockImplementation((_opts: any, cb: any) => {
        const emitter = new EventEmitter() as any;
        setTimeout(() => cb({ statusCode: 200 }), 5);
        return emitter;
      });

      let requestCount = 0;
      vi.spyOn(http, 'request').mockImplementation((_opts: any, cb: any) => {
        requestCount++;
        const emitter = new EventEmitter() as any;
        emitter.write = vi.fn();
        emitter.end = vi.fn();
        setTimeout(() => {
          const res = new EventEmitter() as any;
          res.statusCode = 500;
          cb(res);
          res.emit('data', Buffer.from('Internal Server Error'));
          res.emit('end');
        }, 5);
        return emitter;
      });

      // Pre-flight collision check returns null; monitoring lookup returns the document
      mockWebhookCollection.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'whevt_ambiguous',
          status: 'RECEIVED',
        });

      await expect(runTest({ pollTimeoutMs: 50, pollIntervalMs: 10 })).rejects.toThrow('Ambiguous dispatch: HTTP request failed (Webhook endpoint returned HTTP 500: Internal Server Error)');
      expect(requestCount).toBe(1);
    });
  });
});
