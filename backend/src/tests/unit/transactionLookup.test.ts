import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';
import { Transaction } from '@payroute/shared';
import { collections } from '../../infra/mongo.js';
import { TransactionRepository } from '../../modules/payments/repository.js';
import { TransactionStateMachine, InvalidTransitionError } from '../../modules/transactions/stateMachine.js';
import { AttemptExecutor } from '../../modules/attempts/attemptExecutor.js';
import { Router } from '../../modules/routing/router.js';
import { CircuitBreaker } from '../../modules/circuit-breaker/circuitBreaker.js';
import { PaymentAttemptRepository } from '../../modules/attempts/repository.js';
import { GatewayRegistry } from '../../modules/gateways/registry.js';
import { logger } from '../../infra/logger.js';

describe('Transaction Lookup & ObjectId Disconnect Regression Tests', () => {
  const domainTxnId = 'txn_01M5JA3P7WEKVS6YPXCZFGJ2MV';
  const nativeObjectId = new ObjectId('6ada461ae6256d73169c0454');

  let mockTransactionDoc: any;
  let findOneFilter: any = null;
  let findOneAndUpdateFilter: any = null;
  let findOneAndUpdateUpdate: any = null;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockTransactionDoc = {
      _id: nativeObjectId,
      id: domainTxnId,
      clientId: 'usr_client_001',
      amount: 5000,
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

    findOneFilter = null;
    findOneAndUpdateFilter = null;
    findOneAndUpdateUpdate = null;

    vi.spyOn(collections, 'transactions').mockReturnValue({
      findOne: vi.fn(async (filter: any) => {
        findOneFilter = filter;
        // Check if filter matches domain id or ObjectId _id
        if (filter.$or) {
          const matches = filter.$or.some((clause: any) => {
            if (clause.id && clause.id === mockTransactionDoc.id) return true;
            if (clause._id && String(clause._id) === String(mockTransactionDoc._id)) return true;
            return false;
          });
          return matches ? { ...mockTransactionDoc } : null;
        }
        if (filter._id && String(filter._id) === String(mockTransactionDoc._id)) {
          return { ...mockTransactionDoc };
        }
        if (filter.id && filter.id === mockTransactionDoc.id) {
          return { ...mockTransactionDoc };
        }
        return null;
      }),
      findOneAndUpdate: vi.fn(async (filter: any, update: any) => {
        findOneAndUpdateFilter = filter;
        findOneAndUpdateUpdate = update;

        let matches = false;
        if (filter.$or) {
          matches = filter.$or.some((clause: any) => {
            if (clause.id && clause.id === mockTransactionDoc.id) return true;
            if (clause._id && String(clause._id) === String(mockTransactionDoc._id)) return true;
            return false;
          });
        } else if (filter._id && String(filter._id) === String(mockTransactionDoc._id)) {
          matches = true;
        }

        if (matches && filter.status?.$in?.includes(mockTransactionDoc.status)) {
          mockTransactionDoc = {
            ...mockTransactionDoc,
            ...update.$set,
            version: mockTransactionDoc.version + (update.$inc?.version || 1),
          };
          return { ...mockTransactionDoc };
        }
        return null;
      }),
      updateOne: vi.fn(async () => ({ modifiedCount: 1 })),
    } as any);
  });

  describe('TransactionRepository.findById', () => {
    it('successfully finds transaction when MongoDB _id is an ObjectId and query is domain id string', async () => {
      const found = await TransactionRepository.findById(domainTxnId);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(domainTxnId);
      expect(found?._id).toEqual(nativeObjectId);
      expect(findOneFilter).toEqual({ $or: [{ id: domainTxnId }, { _id: domainTxnId }] });
    });

    it('returns null when transaction domain id does not exist', async () => {
      const found = await TransactionRepository.findById('txn_nonexistent_id');
      expect(found).toBeNull();
    });
  });

  describe('TransactionStateMachine.transition', () => {
    it('successfully transitions transaction whose _id is an ObjectId using domain id', async () => {
      const updated = await TransactionStateMachine.transition(
        domainTxnId,
        'PROCESSING',
        { updatedAt: new Date() },
        { at: new Date(), type: 'worker.claim', detail: { attemptNumber: 1 } }
      );

      expect(updated.status).toBe('PROCESSING');
      expect(updated.version).toBe(2);
      expect(findOneAndUpdateFilter.$or).toContainEqual({ id: domainTxnId });
      expect(findOneAndUpdateFilter.status.$in).toContain('CREATED');
    });

    it('throws InvalidTransitionError when document does not exist', async () => {
      await expect(
        TransactionStateMachine.transition('txn_nonexistent', 'PROCESSING')
      ).rejects.toThrow(InvalidTransitionError);
    });

    it('throws InvalidTransitionError when transition is not allowed from current status', async () => {
      mockTransactionDoc.status = 'SUCCESS';
      await expect(
        TransactionStateMachine.transition(domainTxnId, 'PROCESSING')
      ).rejects.toThrow(InvalidTransitionError);
    });
  });

  describe('AttemptExecutor.runJob', () => {
    it('successfully loads transaction and transitions to PROCESSING when _id is an ObjectId', async () => {
      // Mock downstream dependencies so AttemptExecutor can run smoothly
      vi.spyOn(Router, 'select').mockResolvedValue({
        strategy: 'deterministic-v1',
        selected: 'stripe',
        reason: 'PRIMARY',
        considered: [],
        decidedAt: new Date(),
      });

      vi.spyOn(CircuitBreaker, 'acquire').mockResolvedValue({
        allowed: true,
        reason: 'CLOSED',
        isProbe: false,
      });

      vi.spyOn(CircuitBreaker, 'recordSuccess').mockResolvedValue();

      vi.spyOn(PaymentAttemptRepository, 'insert').mockResolvedValue({} as any);
      vi.spyOn(PaymentAttemptRepository, 'update').mockResolvedValue();

      vi.spyOn(GatewayRegistry, 'getGateway').mockReturnValue({
        createPayment: vi.fn(async () => ({
          success: true,
          gatewayReference: 'ch_stripe_test_123',
          rawResponse: {},
        })),
        verifyWebhook: vi.fn(),
      } as any);

      await AttemptExecutor.runJob({ transactionId: domainTxnId, attemptNumber: 1 });

      // Verification: transaction was transitioned out of CREATED to AWAITING_CONFIRMATION
      expect(mockTransactionDoc.status).toBe('AWAITING_CONFIRMATION');
      expect(mockTransactionDoc.finalGateway).toBe('stripe');
      expect(mockTransactionDoc.gatewayReference).toBe('ch_stripe_test_123');
    });

    it('fails with an error and does not silently succeed when transaction is missing', async () => {
      const errorSpy = vi.spyOn(logger, 'error');

      await expect(
        AttemptExecutor.runJob({ transactionId: 'txn_nonexistent', attemptNumber: 1 })
      ).rejects.toThrow('Transaction txn_nonexistent not found');

      expect(errorSpy).toHaveBeenCalledWith(
        { transactionId: 'txn_nonexistent' },
        'AttemptExecutor failed: transaction not found'
      );
    });
  });
});
