import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as mongoInfra from '../../infra/mongo.js';
import { collections } from '../../infra/mongo.js';
import {
  APPROVED_REPAIR_TARGETS,
  validatePreconditions,
  executeRepairTransaction,
  verifyPostConditions,
  main,
} from '../../scripts/repair-historical-attempts.js';
import { TransactionRepository } from '../../modules/payments/repository.js';
import { PaymentAttemptRepository } from '../../modules/attempts/repository.js';

describe('Repair Historical Attempts Unit Tests (Mocked DB)', () => {
  let mockTxns: Record<string, any>;
  let mockAttempts: Record<string, any>;

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(mongoInfra, 'connectMongo').mockResolvedValue({} as any);
    vi.spyOn(mongoInfra, 'closeMongo').mockResolvedValue(undefined);
    vi.spyOn(mongoInfra, 'getMongoClient').mockReturnValue({
      startSession: vi.fn(),
    } as any);

    mockTxns = {
      'txn_01M5QDYZ9GCPT8RM0BD6N57ZSD': {
        id: 'txn_01M5QDYZ9GCPT8RM0BD6N57ZSD',
        status: 'SUCCESS',
        attemptCount: 0,
        retryCount: 0,
        version: 4,
        gatewayReference: 'pi_3UU8NRF8v6d32i831EjFW6os',
      },
      'txn_01M5P252FZPZNH2X7YBP6BXNWE': {
        id: 'txn_01M5P252FZPZNH2X7YBP6BXNWE',
        status: 'SUCCESS',
        attemptCount: 0,
        retryCount: 0,
        version: 4,
        gatewayReference: 'pi_3UTwQUF8v6d32i832h5ovxNc',
      },
    };

    mockAttempts = {
      'att_01M5QDYZNV8ZDS8TAZBSKCCK8V': {
        id: 'att_01M5QDYZNV8ZDS8TAZBSKCCK8V',
        transactionId: 'txn_01M5QDYZ9GCPT8RM0BD6N57ZSD',
        attemptNumber: 1,
        status: 'STARTED',
        gatewayReference: null,
      },
      'att_01M5P252R0G7M4GNKJQFZJNRSB': {
        id: 'att_01M5P252R0G7M4GNKJQFZJNRSB',
        transactionId: 'txn_01M5P252FZPZNH2X7YBP6BXNWE',
        attemptNumber: 1,
        status: 'STARTED',
        gatewayReference: null,
      },
    };

    vi.spyOn(collections, 'transactions').mockReturnValue({
      findOne: vi.fn(async (filter: any) => mockTxns[filter.id] || null),
      updateOne: vi.fn(async () => ({ matchedCount: 1, modifiedCount: 1 })),
    } as any);

    vi.spyOn(collections, 'paymentAttempts').mockReturnValue({
      findOne: vi.fn(async (filter: any) => mockAttempts[filter.id] || null),
      updateOne: vi.fn(async () => ({ matchedCount: 1, modifiedCount: 1 })),
    } as any);
  });

  describe('Precondition Validation', () => {
    it('passes validation when all four documents match expected preconditions', async () => {
      const result = await validatePreconditions();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(Object.keys(result.documents.txns)).toHaveLength(2);
      expect(Object.keys(result.documents.attempts)).toHaveLength(2);
    });

    it('fails validation if a target transaction is missing', async () => {
      delete mockTxns['txn_01M5QDYZ9GCPT8RM0BD6N57ZSD'];

      const result = await validatePreconditions();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Transaction "txn_01M5QDYZ9GCPT8RM0BD6N57ZSD" not found in database.'
      );
    });

    it('fails validation if a target attempt is missing', async () => {
      delete mockAttempts['att_01M5QDYZNV8ZDS8TAZBSKCCK8V'];

      const result = await validatePreconditions();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'PaymentAttempt "att_01M5QDYZNV8ZDS8TAZBSKCCK8V" not found in database.'
      );
    });

    it('fails validation if transaction preconditions are stale (attemptCount already 1)', async () => {
      mockTxns['txn_01M5QDYZ9GCPT8RM0BD6N57ZSD'].attemptCount = 1;

      const result = await validatePreconditions();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Transaction "txn_01M5QDYZ9GCPT8RM0BD6N57ZSD" attemptCount is 1, expected 0.'
      );
    });

    it('fails validation if transaction status or version has changed', async () => {
      mockTxns['txn_01M5P252FZPZNH2X7YBP6BXNWE'].status = 'FAILED';
      mockTxns['txn_01M5P252FZPZNH2X7YBP6BXNWE'].version = 5;

      const result = await validatePreconditions();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Transaction "txn_01M5P252FZPZNH2X7YBP6BXNWE" status is "FAILED", expected "SUCCESS".'
      );
      expect(result.errors).toContain(
        'Transaction "txn_01M5P252FZPZNH2X7YBP6BXNWE" version is 5, expected 4.'
      );
    });

    it('fails validation if attempt status is not STARTED or gatewayReference is already set', async () => {
      mockAttempts['att_01M5P252R0G7M4GNKJQFZJNRSB'].status = 'SUCCEEDED';
      mockAttempts['att_01M5P252R0G7M4GNKJQFZJNRSB'].gatewayReference = 'pi_some_ref';

      const result = await validatePreconditions();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'PaymentAttempt "att_01M5P252R0G7M4GNKJQFZJNRSB" status is "SUCCEEDED", expected "STARTED".'
      );
      expect(result.errors).toContain(
        'PaymentAttempt "att_01M5P252R0G7M4GNKJQFZJNRSB" gatewayReference is "pi_some_ref", expected null.'
      );
    });

    it('fails validation if attempt transactionId does not match parent transaction', async () => {
      mockAttempts['att_01M5QDYZNV8ZDS8TAZBSKCCK8V'].transactionId = 'txn_other_mismatch';

      const result = await validatePreconditions();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'PaymentAttempt "att_01M5QDYZNV8ZDS8TAZBSKCCK8V" transactionId is "txn_other_mismatch", expected "txn_01M5QDYZ9GCPT8RM0BD6N57ZSD".'
      );
    });
  });

  describe('Transaction Execution & Abort Handling', () => {
    let mockSession: any;
    let mockClient: any;

    beforeEach(() => {
      mockSession = {
        withTransaction: vi.fn(async (callback: () => Promise<void>) => {
          await callback();
        }),
        endSession: vi.fn().mockResolvedValue(undefined),
      };

      mockClient = {
        startSession: vi.fn(() => mockSession),
      };
    });

    it('commits successfully when all 4 updates match and modify exactly one document', async () => {
      const result = await executeRepairTransaction(mockClient);
      expect(result.success).toBe(true);
      expect(result.modifiedCount).toBe(4);
      expect(mockSession.withTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('aborts transaction if a transaction update matches 0 documents (partial failure)', async () => {
      vi.spyOn(collections, 'transactions').mockReturnValue({
        findOne: vi.fn(async (filter: any) => mockTxns[filter.id] || null),
        updateOne: vi.fn(async (filter: any) => {
          if (filter.id === 'txn_01M5QDYZ9GCPT8RM0BD6N57ZSD') {
            return { matchedCount: 0, modifiedCount: 0 };
          }
          return { matchedCount: 1, modifiedCount: 1 };
        }),
      } as any);

      await expect(executeRepairTransaction(mockClient)).rejects.toThrow(
        /Transaction update condition not met for "txn_01M5QDYZ9GCPT8RM0BD6N57ZSD"/
      );
      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('aborts transaction if an attempt update matches 0 documents', async () => {
      vi.spyOn(collections, 'paymentAttempts').mockReturnValue({
        findOne: vi.fn(async (filter: any) => mockAttempts[filter.id] || null),
        updateOne: vi.fn(async (filter: any) => {
          if (filter.id === 'att_01M5P252R0G7M4GNKJQFZJNRSB') {
            return { matchedCount: 0, modifiedCount: 0 };
          }
          return { matchedCount: 1, modifiedCount: 1 };
        }),
      } as any);

      await expect(executeRepairTransaction(mockClient)).rejects.toThrow(
        /PaymentAttempt update condition not met for "att_01M5P252R0G7M4GNKJQFZJNRSB"/
      );
      expect(mockSession.endSession).toHaveBeenCalled();
    });
  });

  describe('Post-Repair Verification', () => {
    it('verifies successfully when all 4 documents and linkages reflect repaired values', async () => {
      vi.spyOn(TransactionRepository, 'findById').mockImplementation(async (id: string) => {
        const base = mockTxns[id];
        return base ? { ...base, attemptCount: 1 } : null;
      });

      vi.spyOn(PaymentAttemptRepository, 'findById').mockImplementation(async (id: string) => {
        const target = APPROVED_REPAIR_TARGETS.find((t) => t.attemptId === id);
        if (!target) return null;
        return {
          id: target.attemptId,
          transactionId: target.txnId,
          attemptNumber: 1,
          status: 'SUCCEEDED',
          gatewayReference: target.expectedTxnGatewayRef,
          latencyMs: target.approvedLatencyMs,
          finishedAt: new Date(target.approvedFinishedAt),
        } as any;
      });

      vi.spyOn(PaymentAttemptRepository, 'findByTransactionId').mockImplementation(async (txnId: string) => {
        const target = APPROVED_REPAIR_TARGETS.find((t) => t.txnId === txnId);
        if (!target) return [];
        return [{ id: target.attemptId }] as any;
      });

      vi.spyOn(PaymentAttemptRepository, 'findByGatewayRef').mockImplementation(async (gw: string, ref: string) => {
        const target = APPROVED_REPAIR_TARGETS.find((t) => t.expectedTxnGatewayRef === ref);
        if (!target) return null;
        return { id: target.attemptId } as any;
      });

      const check = await verifyPostConditions();
      expect(check.verified).toBe(true);
      expect(check.issues).toHaveLength(0);
    });

    it('reports issues if a repaired attempt status or latency does not match', async () => {
      vi.spyOn(TransactionRepository, 'findById').mockImplementation(async (id: string) => {
        const base = mockTxns[id];
        return base ? { ...base, attemptCount: 1 } : null;
      });

      vi.spyOn(PaymentAttemptRepository, 'findById').mockImplementation(async (id: string) => {
        const target = APPROVED_REPAIR_TARGETS.find((t) => t.attemptId === id);
        if (!target) return null;
        return {
          id: target.attemptId,
          transactionId: target.txnId,
          attemptNumber: 1,
          status: 'STARTED', // Stale
          gatewayReference: target.expectedTxnGatewayRef,
          latencyMs: 9999, // Mismatched
          finishedAt: new Date(target.approvedFinishedAt),
        } as any;
      });

      vi.spyOn(PaymentAttemptRepository, 'findByTransactionId').mockResolvedValue([{ id: 'att_dummy' }] as any);
      vi.spyOn(PaymentAttemptRepository, 'findByGatewayRef').mockResolvedValue(null);

      const check = await verifyPostConditions();
      expect(check.verified).toBe(false);
      expect(check.issues.length).toBeGreaterThan(0);
      expect(check.issues.some((i) => i.includes('expected "SUCCEEDED"'))).toBe(true);
    });
  });

  describe('Default Dry-Run Mode Safety', () => {
    it('executes only read validation and does not trigger writes when run without --execute', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Call main with empty args (default dry run)
      await main([]);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('DRY-RUN (READ-ONLY)'));
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Dry-run completed successfully. Zero database writes performed.')
      );
    });
  });
});
