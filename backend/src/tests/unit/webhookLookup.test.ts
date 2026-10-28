import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';
import { collections } from '../../infra/mongo.js';
import { WebhookEventRepository } from '../../modules/webhooks/repository.js';
import { WebhookProcessor, RetryableProcessingError } from '../../modules/webhooks/processor.js';
import { PaymentAttemptRepository } from '../../modules/attempts/repository.js';
import { SweepJob } from '../../modules/maintenance/sweep.js';
import * as queueModule from '../../infra/queues.js';
import { logger } from '../../infra/logger.js';

describe('Webhook Lookup & Processing Regression Tests', () => {
  const domainEventId = 'whe_01M5P6W15NH0QCSVDVZMG63FHW';
  const nativeObjectId = new ObjectId('6adc451f906f371b8f0ab6c6');

  let mockWebhookDoc: any;
  let findOneFilter: any = null;
  let updateFilter: any = null;
  let updateDoc: any = null;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockWebhookDoc = {
      _id: nativeObjectId,
      id: domainEventId,
      gateway: 'stripe',
      eventId: 'evt_test_123',
      eventType: 'payment_intent.succeeded',
      status: 'RECEIVED',
      payloadSnapshot: {
        id: 'evt_test_123',
        type: 'payment_intent.succeeded',
        object_id: 'pi_unmatched_123',
        status: 'succeeded',
        amount: 5000,
        currency: 'inr',
        metadata: {
          payroute_transaction_id: 'txn_unmatched_123'
        }
      },
      rawBodyHash: 'hash_123',
      transactionId: null,
      attemptId: null,
      duplicateCount: 0,
      lastDuplicateAt: null,
      processingAttempts: 0,
      lastError: null,
      requestId: 'req_123',
      receivedAt: new Date(Date.now() - 120000), // 2 mins ago
      enqueuedAt: null,
      processingStartedAt: null,
      processedAt: null,
      failedAt: null,
    };

    findOneFilter = null;
    updateFilter = null;
    updateDoc = null;

    vi.spyOn(collections, 'webhookEvents').mockReturnValue({
      findOne: vi.fn(async (filter: any) => {
        findOneFilter = filter;
        if (filter.$or) {
          const match = filter.$or.some((c: any) => {
            if (c.id && c.id === mockWebhookDoc.id) return true;
            if (c._id && String(c._id) === String(mockWebhookDoc._id)) return true;
            return false;
          });
          return match ? { ...mockWebhookDoc } : null;
        }
        if (filter.id && filter.id === mockWebhookDoc.id) return { ...mockWebhookDoc };
        if (filter._id && String(filter._id) === String(mockWebhookDoc._id)) return { ...mockWebhookDoc };
        return null;
      }),
      findOneAndUpdate: vi.fn(async (filter: any, update: any) => {
        let match = false;
        if (filter.$or) {
          match = filter.$or.some((c: any) => {
            if (c.id && c.id === mockWebhookDoc.id) return true;
            if (c._id && String(c._id) === String(mockWebhookDoc._id)) return true;
            return false;
          });
        }
        if (match && filter.status?.$in?.includes(mockWebhookDoc.status)) {
          mockWebhookDoc = {
            ...mockWebhookDoc,
            ...update.$set,
            processingAttempts: mockWebhookDoc.processingAttempts + (update.$inc?.processingAttempts || 0),
          };
          return { ...mockWebhookDoc };
        }
        return null;
      }),
      updateOne: vi.fn(async (filter: any, update: any) => {
        updateFilter = filter;
        updateDoc = update;
        let match = false;
        if (filter.$or) {
          match = filter.$or.some((c: any) => {
            if (c.id && c.id === mockWebhookDoc.id) return true;
            if (c._id && String(c._id) === String(mockWebhookDoc._id)) return true;
            return false;
          });
        }
        if (match) {
          mockWebhookDoc = {
            ...mockWebhookDoc,
            ...update.$set,
            ...(update.$inc ? { duplicateCount: (mockWebhookDoc.duplicateCount || 0) + (update.$inc.duplicateCount || 0) } : {})
          };
          return { matchedCount: 1, modifiedCount: 1 };
        }
        return { matchedCount: 0, modifiedCount: 0 };
      }),
    } as any);
  });

  describe('WebhookEventRepository.findById and update', () => {
    it('successfully finds webhook event by domain id when _id is an ObjectId', async () => {
      const found = await WebhookEventRepository.findById(domainEventId);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(domainEventId);
      expect(found?._id).toEqual(nativeObjectId);
      expect(findOneFilter).toEqual({ $or: [{ id: domainEventId }, { _id: domainEventId }] });
    });

    it('returns null when domain id does not exist', async () => {
      const found = await WebhookEventRepository.findById('whe_nonexistent');
      expect(found).toBeNull();
    });

    it('successfully updates status, processingAttempts, enqueuedAt, and error fields using domain id', async () => {
      const now = new Date();
      await WebhookEventRepository.update(domainEventId, {
        status: 'ORPHANED',
        lastError: 'Attempt not found',
        enqueuedAt: now,
      });

      expect(mockWebhookDoc.status).toBe('ORPHANED');
      expect(mockWebhookDoc.lastError).toBe('Attempt not found');
      expect(mockWebhookDoc.enqueuedAt).toEqual(now);
      expect(updateFilter).toEqual({ $or: [{ id: domainEventId }, { _id: domainEventId }] });
    });
  });

  describe('WebhookProcessor.runJob', () => {
    it('successfully claims event with domain id, transitions to PROCESSING, and increments attempts', async () => {
      vi.spyOn(PaymentAttemptRepository, 'findByGatewayRef').mockResolvedValue(null);
      vi.spyOn(PaymentAttemptRepository, 'findByTransactionId').mockResolvedValue([]);

      // 1st attempt: should throw RetryableProcessingError
      await expect(
        WebhookProcessor.runJob({ webhookEventId: domainEventId })
      ).rejects.toThrow(RetryableProcessingError);

      expect(mockWebhookDoc.status).toBe('RECEIVED'); // Reset for retry
      expect(mockWebhookDoc.processingAttempts).toBe(1);
    });

    it('fails with an error and logs at error level when webhook event is missing', async () => {
      const errorSpy = vi.spyOn(logger, 'error');

      await expect(
        WebhookProcessor.runJob({ webhookEventId: 'whe_missing' })
      ).rejects.toThrow('Webhook event whe_missing not found');

      expect(errorSpy).toHaveBeenCalledWith(
        { webhookEventId: 'whe_missing' },
        'WebhookProcessor failed: webhook event not found'
      );
    });

    it('skips execution idempotently when event is already finished or processing', async () => {
      mockWebhookDoc.status = 'PROCESSED';
      const infoSpy = vi.spyOn(logger, 'info');

      await WebhookProcessor.runJob({ webhookEventId: domainEventId });

      expect(infoSpy).toHaveBeenCalledWith(
        { webhookEventId: domainEventId, status: 'PROCESSED' },
        'WebhookProcessor skipped: event already processing or finished'
      );
    });

    it('transitions to ORPHANED when processingAttempts reaches 5 without finding attempt', async () => {
      mockWebhookDoc.processingAttempts = 4; // next claim will make it 5
      vi.spyOn(PaymentAttemptRepository, 'findByGatewayRef').mockResolvedValue(null);
      vi.spyOn(PaymentAttemptRepository, 'findByTransactionId').mockResolvedValue([]);
      const warnSpy = vi.spyOn(logger, 'warn');

      await WebhookProcessor.runJob({ webhookEventId: domainEventId });

      expect(mockWebhookDoc.status).toBe('ORPHANED');
      expect(mockWebhookDoc.lastError).toContain('No matching attempt or transaction found after 5 tries');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ webhookEventId: domainEventId }),
        'Webhook event marked ORPHANED'
      );
    });
  });

  describe('Maintenance Sweeper S2 (Stuck Webhooks)', () => {
    it('does not re-enqueue when BullMQ job is already marked completed', async () => {
      const mockQueue = {
        getJob: vi.fn(async () => ({
          getState: async () => 'completed',
        })),
        add: vi.fn(),
      };
      vi.spyOn(queueModule, 'getWebhooksQueue').mockReturnValue(mockQueue as any);
      const warnSpy = vi.spyOn(logger, 'warn');

      vi.spyOn(collections, 'webhookEvents').mockReturnValue({
        find: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            toArray: async () => [mockWebhookDoc],
          }),
        }),
      } as any);

      vi.spyOn(collections, 'transactions').mockReturnValue({
        find: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            toArray: async () => [],
          }),
        }),
      } as any);

      const result = await SweepJob.run();

      expect(mockQueue.getJob).toHaveBeenCalledWith(domainEventId);
      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        { webhookEventId: domainEventId },
        'Sweeper S2 skipped: webhook event job already completed in BullMQ'
      );
    });

    it('does not re-enqueue when BullMQ job is active, waiting, or delayed', async () => {
      const mockQueue = {
        getJob: vi.fn(async () => ({
          getState: async () => 'delayed',
        })),
        add: vi.fn(),
      };
      vi.spyOn(queueModule, 'getWebhooksQueue').mockReturnValue(mockQueue as any);

      vi.spyOn(collections, 'webhookEvents').mockReturnValue({
        find: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            toArray: async () => [mockWebhookDoc],
          }),
        }),
      } as any);

      vi.spyOn(collections, 'transactions').mockReturnValue({
        find: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            toArray: async () => [],
          }),
        }),
      } as any);

      await SweepJob.run();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('re-enqueues when BullMQ job does not exist in queue', async () => {
      const mockQueue = {
        getJob: vi.fn(async () => null),
      };
      vi.spyOn(queueModule, 'getWebhooksQueue').mockReturnValue(mockQueue as any);
      const enqueueSpy = vi.spyOn(queueModule, 'enqueueWebhookProcessJob').mockResolvedValue({ id: domainEventId } as any);

      vi.spyOn(collections, 'webhookEvents').mockReturnValue({
        find: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            toArray: async () => [mockWebhookDoc],
          }),
        }),
      } as any);

      vi.spyOn(collections, 'transactions').mockReturnValue({
        find: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            toArray: async () => [],
          }),
        }),
      } as any);

      const result = await SweepJob.run();
      expect(enqueueSpy).toHaveBeenCalledWith(
        { webhookEventId: domainEventId },
        { jobId: domainEventId }
      );
      expect(result.repairs).toBe(1);
    });
  });
});
