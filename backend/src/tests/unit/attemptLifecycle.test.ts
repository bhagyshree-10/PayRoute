import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';
import { PaymentAttempt, Transaction } from '@payroute/shared';
import { collections } from '../../infra/mongo.js';
import { PaymentAttemptRepository } from '../../modules/attempts/repository.js';
import { AttemptExecutor } from '../../modules/attempts/attemptExecutor.js';
import { TransactionRepository } from '../../modules/payments/repository.js';
import { TransactionStateMachine } from '../../modules/transactions/stateMachine.js';
import { Router } from '../../modules/routing/router.js';
import { CircuitBreaker } from '../../modules/circuit-breaker/circuitBreaker.js';
import { GatewayRegistry } from '../../modules/gateways/registry.js';
import { applyGatewayOutcome } from '../../modules/transactions/applyGatewayOutcome.js';

describe('Attempt Lifecycle, Repository Lookups & Timeline Labeling', () => {
  const domainAttemptId = 'att_01M5TESTATTEMPT000000000001';
  const nativeAttemptObjectId = new ObjectId('6adc31cd2cbe440929f9275c');
  const domainTxnId = 'txn_01M5TESTTXN0000000000000001';
  const nativeTxnObjectId = new ObjectId('6adc31cd906f371b8f0ab6c5');

  let mockAttemptDoc: any;
  let mockTxnDoc: any;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockAttemptDoc = {
      _id: nativeAttemptObjectId,
      id: domainAttemptId,
      transactionId: domainTxnId,
      attemptNumber: 1,
      gateway: 'stripe',
      status: 'STARTED',
      gatewayIdempotencyKey: `pr_${domainTxnId}_stripe_g1`,
      gatewayReference: null,
      routingDecision: { strategy: 'deterministic-v1', selected: 'stripe', reason: 'PRIMARY', considered: [], decidedAt: new Date() },
      isProbe: false,
      error: null,
      latencyMs: null,
      startedAt: new Date(),
      finishedAt: null,
      createdAt: new Date(),
    };

    mockTxnDoc = {
      _id: nativeTxnObjectId,
      id: domainTxnId,
      clientId: 'usr_client_001',
      amount: 10000,
      currency: 'inr',
      status: 'CREATED',
      customer: { reference: 'cust_001' },
      paymentMethodType: 'test_token',
      routing: {
        preferredGateway: null,
        exhaustedGateways: [],
        currentGateway: null,
        gatewayGenerations: { stripe: 1, razorpay: 1 },
      },
      attemptCount: 0,
      retryCount: 0,
      finalGateway: null,
      gatewayReference: null,
      failure: null,
      flags: [],
      timeline: [],
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  describe('Part A: PaymentAttempt Repository ID Lookups', () => {
    it('finds payment attempt by string domain ID when document has native ObjectId _id', async () => {
      vi.spyOn(collections, 'paymentAttempts').mockReturnValue({
        findOne: vi.fn(async (filter: any) => {
          if (filter.$or) {
            const matches = filter.$or.some((clause: any) => clause.id === domainAttemptId || clause._id === domainAttemptId);
            return matches ? mockAttemptDoc : null;
          }
          return null;
        }),
      } as any);

      const found = await PaymentAttemptRepository.findById(domainAttemptId);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(domainAttemptId);
      expect(found?._id).toBe(nativeAttemptObjectId);
    });

    it('finds payment attempt by ObjectId when queried directly', async () => {
      vi.spyOn(collections, 'paymentAttempts').mockReturnValue({
        findOne: vi.fn(async (filter: any) => {
          if (filter.$or) {
            const matches = filter.$or.some((clause: any) => clause._id?.toString() === nativeAttemptObjectId.toString());
            return matches ? mockAttemptDoc : null;
          }
          return null;
        }),
      } as any);

      const found = await PaymentAttemptRepository.findById(nativeAttemptObjectId.toString());
      expect(found).not.toBeNull();
      expect(found?.id).toBe(domainAttemptId);
    });

    it('returns null for genuinely missing payment attempt', async () => {
      vi.spyOn(collections, 'paymentAttempts').mockReturnValue({
        findOne: vi.fn(async () => null),
      } as any);

      const found = await PaymentAttemptRepository.findById('att_nonexistent');
      expect(found).toBeNull();
    });

    it('updates payment attempt using domain ID when document has native ObjectId _id', async () => {
      let capturedFilter: any = null;
      let capturedUpdate: any = null;

      vi.spyOn(collections, 'paymentAttempts').mockReturnValue({
        updateOne: vi.fn(async (filter: any, update: any) => {
          capturedFilter = filter;
          capturedUpdate = update;
          return { matchedCount: 1, modifiedCount: 1 };
        }),
      } as any);

      await PaymentAttemptRepository.update(domainAttemptId, {
        status: 'ACCEPTED',
        gatewayReference: 'pi_test_123',
        latencyMs: 150,
      });

      expect(capturedFilter).toEqual({
        $or: [{ id: domainAttemptId }, { _id: domainAttemptId }],
      });
      expect(capturedUpdate).toEqual({
        $set: {
          status: 'ACCEPTED',
          gatewayReference: 'pi_test_123',
          latencyMs: 150,
        },
      });
    });
  });

  describe('Part B: Transaction Attempt Counter & Attempt Lifecycle', () => {
    it('increments attemptCount from 0 to 1 on initial claim and transitions attempt to ACCEPTED', async () => {
      let persistedTxn: any = { ...mockTxnDoc, status: 'CREATED', attemptCount: 0 };
      let persistedAttempt: any = null;

      vi.spyOn(TransactionRepository, 'findById').mockImplementation(async () => ({ ...persistedTxn }));
      vi.spyOn(collections, 'transactions').mockReturnValue({
        findOneAndUpdate: vi.fn(async (filter: any, update: any) => {
          if (filter.status?.$in?.includes(persistedTxn.status)) {
            persistedTxn = {
              ...persistedTxn,
              ...update.$set,
              version: persistedTxn.version + 1,
              timeline: [...persistedTxn.timeline, ...(update.$push?.timeline?.$each || [])],
            };
            return persistedTxn;
          }
          return null;
        }),
      } as any);

      vi.spyOn(Router, 'select').mockResolvedValue({
        strategy: 'deterministic-v1',
        selected: 'stripe',
        reason: 'PRIMARY',
        considered: [],
        decidedAt: new Date(),
      });
      vi.spyOn(CircuitBreaker, 'acquire').mockResolvedValue({ allowed: true, isProbe: false });
      vi.spyOn(CircuitBreaker, 'recordSuccess').mockResolvedValue();

      vi.spyOn(PaymentAttemptRepository, 'insert').mockImplementation(async (att) => {
        persistedAttempt = { ...att };
        return att;
      });
      vi.spyOn(PaymentAttemptRepository, 'update').mockImplementation(async (id, patch) => {
        if (persistedAttempt) {
          persistedAttempt = { ...persistedAttempt, ...patch };
        }
      });

      const mockGateway = {
        name: 'stripe',
        createPayment: vi.fn().mockResolvedValue({
          gatewayReference: 'pi_test_accepted_123',
          rawResponse: {},
        }),
      };
      vi.spyOn(GatewayRegistry, 'getGateway').mockReturnValue(mockGateway as any);

      // Run Job for first attempt
      await AttemptExecutor.runJob({ transactionId: domainTxnId, attemptNumber: 1 });

      // Verifications:
      // 1. attemptCount incremented from 0 to 1 exactly once
      expect(persistedTxn.attemptCount).toBe(1);
      expect(persistedTxn.status).toBe('AWAITING_CONFIRMATION');
      expect(persistedTxn.timeline).toHaveLength(2);
      expect(persistedTxn.timeline[0].type).toBe('worker.claim');
      expect(persistedTxn.timeline[0].detail.attemptNumber).toBe(1);
      expect(persistedTxn.timeline[1].type).toBe('payment.accepted');

      // 2. PaymentAttempt transitioned from STARTED to ACCEPTED
      expect(persistedAttempt.status).toBe('ACCEPTED');
      expect(persistedAttempt.gatewayReference).toBe('pi_test_accepted_123');
      expect(persistedAttempt.latencyMs).toBeTypeOf('number');
    });

    it('increments attemptCount from 1 to 2 when retrying from RETRYING status', async () => {
      let persistedTxn: any = {
        ...mockTxnDoc,
        status: 'RETRYING',
        attemptCount: 1,
        retryCount: 1,
      };

      vi.spyOn(TransactionRepository, 'findById').mockImplementation(async () => ({ ...persistedTxn }));
      vi.spyOn(collections, 'transactions').mockReturnValue({
        findOneAndUpdate: vi.fn(async (filter: any, update: any) => {
          if (filter.status?.$in?.includes(persistedTxn.status)) {
            persistedTxn = {
              ...persistedTxn,
              ...update.$set,
              version: persistedTxn.version + 1,
              timeline: [...persistedTxn.timeline, ...(update.$push?.timeline?.$each || [])],
            };
            return persistedTxn;
          }
          return null;
        }),
      } as any);

      vi.spyOn(Router, 'select').mockResolvedValue({
        strategy: 'deterministic-v1',
        selected: 'stripe',
        reason: 'PRIMARY',
        considered: [],
        decidedAt: new Date(),
      });
      vi.spyOn(CircuitBreaker, 'acquire').mockResolvedValue({ allowed: true, isProbe: false });
      vi.spyOn(CircuitBreaker, 'recordSuccess').mockResolvedValue();
      vi.spyOn(PaymentAttemptRepository, 'insert').mockResolvedValue({} as any);
      vi.spyOn(PaymentAttemptRepository, 'update').mockResolvedValue();

      const mockGateway = {
        name: 'stripe',
        createPayment: vi.fn().mockResolvedValue({
          gatewayReference: 'pi_test_retry_123',
          rawResponse: {},
        }),
      };
      vi.spyOn(GatewayRegistry, 'getGateway').mockReturnValue(mockGateway as any);

      await AttemptExecutor.runJob({ transactionId: domainTxnId, attemptNumber: 2 });

      expect(persistedTxn.attemptCount).toBe(2);
      expect(persistedTxn.retryCount).toBe(1);
      expect(persistedTxn.status).toBe('AWAITING_CONFIRMATION');
    });

    it('does not increment attemptCount on concurrent duplicate claim', async () => {
      // Transaction is already PROCESSING
      const inFlightTxn = { ...mockTxnDoc, status: 'PROCESSING', attemptCount: 1 };
      vi.spyOn(TransactionRepository, 'findById').mockResolvedValue(inFlightTxn);

      const transitionSpy = vi.spyOn(TransactionStateMachine, 'transition');
      await AttemptExecutor.runJob({ transactionId: domainTxnId, attemptNumber: 1 });

      // Should be skipped immediately without transition
      expect(transitionSpy).not.toHaveBeenCalled();
    });

    it('transitions attempt from ACCEPTED to SUCCEEDED via applyGatewayOutcome', async () => {
      let attemptStatus = 'ACCEPTED';
      vi.spyOn(PaymentAttemptRepository, 'update').mockImplementation(async (id, patch) => {
        if (patch.status) attemptStatus = patch.status;
      });

      const existingTxn = {
        ...mockTxnDoc,
        status: 'AWAITING_CONFIRMATION',
        attemptCount: 1,
        gatewayReference: 'pi_test_123',
      };
      vi.spyOn(TransactionRepository, 'findById').mockResolvedValue(existingTxn);
      vi.spyOn(TransactionStateMachine, 'transition').mockResolvedValue({
        ...existingTxn,
        status: 'SUCCESS',
      } as any);

      const matchedAttempt: PaymentAttempt = {
        ...mockAttemptDoc,
        status: 'ACCEPTED',
        gatewayReference: 'pi_test_123',
      };

      await applyGatewayOutcome(matchedAttempt, {
        type: 'SUCCEEDED',
        gatewayReference: 'pi_test_123',
        source: 'WEBHOOK',
      });

      expect(attemptStatus).toBe('SUCCEEDED');
    });
  });

  describe('Part C: Reconciliation Timeline Labeling', () => {
    it('labels reconciliation-driven success as reconciliation.succeeded', async () => {
      const existingTxn = {
        ...mockTxnDoc,
        status: 'AWAITING_CONFIRMATION',
        attemptCount: 1,
        gatewayReference: 'pi_test_reconcile_123',
      };
      vi.spyOn(TransactionRepository, 'findById').mockResolvedValue(existingTxn);

      let capturedEvent: any = null;
      vi.spyOn(TransactionStateMachine, 'transition').mockImplementation(async (id, to, patch, event) => {
        capturedEvent = event;
        return { ...existingTxn, status: to, ...patch } as any;
      });
      vi.spyOn(PaymentAttemptRepository, 'update').mockResolvedValue();

      await applyGatewayOutcome(mockAttemptDoc, {
        type: 'SUCCEEDED',
        gatewayReference: 'pi_test_reconcile_123',
        source: 'RECONCILIATION',
      });

      expect(capturedEvent).not.toBeNull();
      expect(capturedEvent.type).toBe('reconciliation.succeeded');
      expect(capturedEvent.detail.source).toBe('RECONCILIATION');
      expect(capturedEvent.detail.gatewayReference).toBe('pi_test_reconcile_123');
    });

    it('labels webhook-driven success as webhook.succeeded', async () => {
      const existingTxn = {
        ...mockTxnDoc,
        status: 'AWAITING_CONFIRMATION',
        attemptCount: 1,
        gatewayReference: 'pi_test_webhook_123',
      };
      vi.spyOn(TransactionRepository, 'findById').mockResolvedValue(existingTxn);

      let capturedEvent: any = null;
      vi.spyOn(TransactionStateMachine, 'transition').mockImplementation(async (id, to, patch, event) => {
        capturedEvent = event;
        return { ...existingTxn, status: to, ...patch } as any;
      });
      vi.spyOn(PaymentAttemptRepository, 'update').mockResolvedValue();

      await applyGatewayOutcome(mockAttemptDoc, {
        type: 'SUCCEEDED',
        gatewayReference: 'pi_test_webhook_123',
        source: 'WEBHOOK',
      });

      expect(capturedEvent).not.toBeNull();
      expect(capturedEvent.type).toBe('webhook.succeeded');
      expect(capturedEvent.detail.source).toBe('WEBHOOK');
      expect(capturedEvent.detail.gatewayReference).toBe('pi_test_webhook_123');
    });

    it('labels reconciliation-driven failure as reconciliation.failed', async () => {
      const existingTxn = {
        ...mockTxnDoc,
        status: 'AWAITING_CONFIRMATION',
        attemptCount: 1,
      };
      vi.spyOn(TransactionRepository, 'findById').mockResolvedValue(existingTxn);

      let capturedEvent: any = null;
      vi.spyOn(TransactionStateMachine, 'transition').mockImplementation(async (id, to, patch, event) => {
        capturedEvent = event;
        return { ...existingTxn, status: to, ...patch } as any;
      });
      vi.spyOn(PaymentAttemptRepository, 'update').mockResolvedValue();

      await applyGatewayOutcome(mockAttemptDoc, {
        type: 'FAILED',
        gatewayReference: 'pi_test_fail_123',
        failureCode: 'CARD_DECLINED',
        source: 'RECONCILIATION',
      });

      expect(capturedEvent).not.toBeNull();
      expect(capturedEvent.type).toBe('reconciliation.failed');
      expect(capturedEvent.detail.source).toBe('RECONCILIATION');
      expect(capturedEvent.detail.failureCode).toBe('CARD_DECLINED');
    });

    it('distinguishes webhook-driven vs reconciliation-driven late successes', async () => {
      const existingTxn = {
        ...mockTxnDoc,
        status: 'FAILED',
        attemptCount: 1,
        gatewayReference: 'pi_test_late_123',
      };
      vi.spyOn(TransactionRepository, 'findById').mockResolvedValue(existingTxn);

      let capturedEventReconcile: any = null;
      vi.spyOn(TransactionStateMachine, 'transition').mockImplementation(async (id, to, patch, event) => {
        capturedEventReconcile = event;
        return { ...existingTxn, status: to, ...patch } as any;
      });
      vi.spyOn(PaymentAttemptRepository, 'update').mockResolvedValue();

      await applyGatewayOutcome(mockAttemptDoc, {
        type: 'SUCCEEDED',
        gatewayReference: 'pi_test_late_123',
        source: 'RECONCILIATION',
      });
      expect(capturedEventReconcile.type).toBe('reconciliation.late_success');

      let capturedEventWebhook: any = null;
      vi.spyOn(TransactionStateMachine, 'transition').mockImplementation(async (id, to, patch, event) => {
        capturedEventWebhook = event;
        return { ...existingTxn, status: to, ...patch } as any;
      });

      await applyGatewayOutcome(mockAttemptDoc, {
        type: 'SUCCEEDED',
        gatewayReference: 'pi_test_late_123',
        source: 'WEBHOOK',
      });
      expect(capturedEventWebhook.type).toBe('webhook.late_success');
    });
  });

  describe('Part D: applyGatewayOutcome Idempotency & Terminal Attempt Preservation', () => {
    it('preserves existing finishedAt and all fields on SUCCESS transaction + SUCCEEDED attempt', async () => {
      const historicalFinishedAt = new Date('2026-10-25T13:42:31.000Z');
      const initialTimeline = [
        { at: new Date('2026-10-25T13:40:00.000Z'), type: 'transaction.created', source: 'MERCHANT' },
        { at: new Date('2026-10-25T13:40:05.000Z'), type: 'payment_attempt.initiated', source: 'SYSTEM' },
        { at: new Date('2026-10-25T13:42:30.000Z'), type: 'reconciliation.polled', source: 'RECONCILIATION' },
        { at: new Date('2026-10-25T13:42:31.000Z'), type: 'transaction.succeeded', source: 'RECONCILIATION' },
      ];

      const existingTxn = {
        ...mockTxnDoc,
        status: 'SUCCESS',
        attemptCount: 1,
        retryCount: 0,
        version: 4,
        gatewayReference: 'pi_test_123',
        timeline: [...initialTimeline],
      };
      vi.spyOn(TransactionRepository, 'findById').mockResolvedValue(existingTxn);

      const existingAttempt: PaymentAttempt = {
        ...mockAttemptDoc,
        status: 'SUCCEEDED',
        gatewayReference: 'pi_test_123',
        latencyMs: 1637,
        finishedAt: historicalFinishedAt,
      };

      let capturedPatch: any = null;
      vi.spyOn(PaymentAttemptRepository, 'update').mockImplementation(async (_id, patch) => {
        capturedPatch = patch;
      });

      const transitionSpy = vi.spyOn(TransactionStateMachine, 'transition');
      const txnUpdateOneSpy = vi.fn();
      vi.spyOn(collections, 'transactions').mockReturnValue({
        updateOne: txnUpdateOneSpy,
      } as any);

      const result = await applyGatewayOutcome(existingAttempt, {
        type: 'SUCCEEDED',
        gatewayReference: 'pi_test_123',
        source: 'WEBHOOK',
      });

      // 1. Result confirmation
      expect(result.status).toBe('SUCCESS');
      expect(result.matched).toBe(true);
      expect(result.transactionId).toBe(domainTxnId);

      // 2. PaymentAttempt preservation: finishedAt must NOT be overwritten
      expect(capturedPatch).not.toBeNull();
      expect(capturedPatch.status).toBe('SUCCEEDED');
      expect(capturedPatch.finishedAt).toBeUndefined(); // Omitted so MongoDB preserves existing finishedAt

      // 3. Transaction state immutability
      expect(transitionSpy).not.toHaveBeenCalled();
      expect(txnUpdateOneSpy).not.toHaveBeenCalled();
      expect(existingTxn.status).toBe('SUCCESS');
      expect(existingTxn.version).toBe(4);
      expect(existingTxn.attemptCount).toBe(1);
      expect(existingTxn.retryCount).toBe(0);
      expect(existingTxn.timeline).toHaveLength(4);
      expect(JSON.stringify(existingTxn.timeline)).toBe(JSON.stringify(initialTimeline));
    });

    it('sets finishedAt when a valid non-terminal attempt transitions to SUCCEEDED', async () => {
      const existingTxn = {
        ...mockTxnDoc,
        status: 'AWAITING_CONFIRMATION',
        attemptCount: 1,
        gatewayReference: 'pi_test_123',
      };
      vi.spyOn(TransactionRepository, 'findById').mockResolvedValue(existingTxn);
      vi.spyOn(TransactionStateMachine, 'transition').mockResolvedValue({
        ...existingTxn,
        status: 'SUCCESS',
      } as any);

      const nonTerminalAttempt: PaymentAttempt = {
        ...mockAttemptDoc,
        status: 'ACCEPTED',
        finishedAt: null,
        gatewayReference: 'pi_test_123',
      };

      let capturedPatch: any = null;
      vi.spyOn(PaymentAttemptRepository, 'update').mockImplementation(async (_id, patch) => {
        capturedPatch = patch;
      });

      const result = await applyGatewayOutcome(nonTerminalAttempt, {
        type: 'SUCCEEDED',
        gatewayReference: 'pi_test_123',
        source: 'WEBHOOK',
      });

      expect(result.status).toBe('SUCCESS');
      expect(capturedPatch).not.toBeNull();
      expect(capturedPatch.status).toBe('SUCCEEDED');
      expect(capturedPatch.finishedAt).toBeInstanceOf(Date);
    });

    it('populates finishedAt if an already-terminal attempt has missing finishedAt', async () => {
      const existingTxn = {
        ...mockTxnDoc,
        status: 'SUCCESS',
        attemptCount: 1,
        gatewayReference: 'pi_test_123',
      };
      vi.spyOn(TransactionRepository, 'findById').mockResolvedValue(existingTxn);

      const terminalMissingFinishedAt: PaymentAttempt = {
        ...mockAttemptDoc,
        status: 'SUCCEEDED',
        finishedAt: null,
        gatewayReference: 'pi_test_123',
      };

      let capturedPatch: any = null;
      vi.spyOn(PaymentAttemptRepository, 'update').mockImplementation(async (_id, patch) => {
        capturedPatch = patch;
      });

      await applyGatewayOutcome(terminalMissingFinishedAt, {
        type: 'SUCCEEDED',
        gatewayReference: 'pi_test_123',
        source: 'WEBHOOK',
      });

      expect(capturedPatch).not.toBeNull();
      expect(capturedPatch.status).toBe('SUCCEEDED');
      expect(capturedPatch.finishedAt).toBeInstanceOf(Date);
    });

    it('preserves existing safety behavior and flags DUPLICATE_CHARGE_SUSPECTED on different gateway reference', async () => {
      const existingTxn = {
        ...mockTxnDoc,
        status: 'SUCCESS',
        gatewayReference: 'pi_first_charge_123',
        flags: [],
      };
      vi.spyOn(TransactionRepository, 'findById').mockResolvedValue(existingTxn);

      const txnUpdateOneSpy = vi.fn();
      vi.spyOn(collections, 'transactions').mockReturnValue({
        updateOne: txnUpdateOneSpy,
      } as any);
      vi.spyOn(PaymentAttemptRepository, 'update').mockResolvedValue();

      const secondAttempt: PaymentAttempt = {
        ...mockAttemptDoc,
        id: 'att_second_attempt_002',
        attemptNumber: 2,
        status: 'STARTED',
        finishedAt: null,
        gatewayReference: null,
      };

      const result = await applyGatewayOutcome(secondAttempt, {
        type: 'SUCCEEDED',
        gatewayReference: 'pi_different_charge_456',
        source: 'WEBHOOK',
      });

      expect(result.status).toBe('SUCCESS');
      expect(result.matched).toBe(true);

      // Asserts safety flag is added
      expect(txnUpdateOneSpy).toHaveBeenCalledWith(
        { $or: [{ id: domainTxnId }, { _id: domainTxnId }] },
        { $addToSet: { flags: 'DUPLICATE_CHARGE_SUSPECTED' } }
      );
    });
  });
});
