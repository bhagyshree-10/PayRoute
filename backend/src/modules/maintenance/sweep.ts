import { collections } from '../../infra/mongo.js';
import { env } from '../../config/env.js';
import { logger } from '../../infra/logger.js';
import { getRedisClient } from '../../infra/redis.js';
import { enqueuePaymentAttemptJob, enqueueWebhookProcessJob, getWebhooksQueue } from '../../infra/queues.js';
import { PaymentAttemptRepository } from '../attempts/repository.js';
import { GatewayRegistry } from '../gateways/registry.js';
import { applyGatewayOutcome } from '../transactions/applyGatewayOutcome.js';

export class SweepJobClass {
  async run(): Promise<{ repairs: number; durationMs: number }> {
    const t0 = Date.now();
    const now = new Date();
    let repairs = 0;

    // S1: Stuck Creation (CREATED > 60s)
    const sixtySecAgo = new Date(now.getTime() - 60000);
    const stuckCreations = await collections
      .transactions()
      .find({ status: 'CREATED', createdAt: { $lt: sixtySecAgo } })
      .limit(100)
      .toArray();

    for (const tx of stuckCreations) {
      try {
        await enqueuePaymentAttemptJob(
          { transactionId: tx.id, attemptNumber: 1 },
          { jobId: `${tx.id}-a1`, delay: 0 }
        );
        repairs++;
        logger.info({ transactionId: tx.id }, 'Sweeper S1: Re-enqueued stuck CREATED transaction');
      } catch (err) {
        logger.error({ err, transactionId: tx.id }, 'Sweeper S1 re-enqueue failed');
      }
    }

    // S2: Stuck Webhooks (RECEIVED > 60s)
    const stuckWebhooks = await collections
      .webhookEvents()
      .find({ status: 'RECEIVED', receivedAt: { $lt: sixtySecAgo } })
      .limit(100)
      .toArray();

    for (const ev of stuckWebhooks) {
      try {
        const queue = getWebhooksQueue();
        const existingJob = await queue.getJob(ev.id);
        if (existingJob) {
          const state = await existingJob.getState();
          if (state === 'active' || state === 'waiting' || state === 'delayed') {
            continue;
          }
          if (state === 'completed') {
            logger.warn(
              { webhookEventId: ev.id },
              'Sweeper S2 skipped: webhook event job already completed in BullMQ'
            );
            continue;
          }
        }

        await enqueueWebhookProcessJob(
          { webhookEventId: ev.id },
          { jobId: ev.id }
        );
        repairs++;
        logger.info({ webhookEventId: ev.id }, 'Sweeper S2: Re-enqueued stuck RECEIVED webhook');
      } catch (err) {
        logger.error({ err, webhookEventId: ev.id }, 'Sweeper S2 re-enqueue failed');
      }
    }

    // S3: Stale Processing (PROCESSING > 2 * GATEWAY_TIMEOUT_MS + 30s)
    const staleProcessingLimitMs = 2 * env.GATEWAY_TIMEOUT_MS + 30000;
    const staleTime = new Date(now.getTime() - staleProcessingLimitMs);
    const staleTxns = await collections
      .transactions()
      .find({ status: 'PROCESSING', updatedAt: { $lt: staleTime } })
      .limit(100)
      .toArray();

    for (const tx of staleTxns) {
      try {
        const attempts = await PaymentAttemptRepository.findByTransactionId(tx.id);
        const startedAtt = attempts.find((a) => a.status === 'STARTED');

        if (startedAtt) {
          await PaymentAttemptRepository.update(startedAtt.id, {
            status: 'UNKNOWN',
            finishedAt: now
          });
        }

        // Re-enqueue next attempt on same transaction
        const nextAttemptNum = (tx.attemptCount || 0) + 1;
        await collections.transactions().updateOne(
          { $or: [{ id: tx.id }, { _id: tx.id }], status: 'PROCESSING' },
          { $set: { status: 'RETRYING', updatedAt: now } }
        );

        await enqueuePaymentAttemptJob(
          { transactionId: tx.id, attemptNumber: nextAttemptNum },
          { jobId: `${tx.id}-a${nextAttemptNum}`, delay: 0 }
        );

        repairs++;
        logger.warn({ transactionId: tx.id }, 'Sweeper S3: Recovered stale PROCESSING transaction');
      } catch (err) {
        logger.error({ err, transactionId: tx.id }, 'Sweeper S3 recovery failed');
      }
    }

    // S4: Reconciliation (AWAITING_CONFIRMATION > RECONCILE_AFTER_MS)
    const reconcileTime = new Date(now.getTime() - env.RECONCILE_AFTER_MS);
    const reconcileTxns = await collections
      .transactions()
      .find({ status: 'AWAITING_CONFIRMATION', updatedAt: { $lt: reconcileTime } })
      .limit(100)
      .toArray();

    for (const tx of reconcileTxns) {
      if (tx.finalGateway && tx.gatewayReference) {
        try {
          const adapter = GatewayRegistry.getGateway(tx.finalGateway as any);
          const normalized = await adapter.fetchPaymentStatus(tx.gatewayReference);

          const attempts = await PaymentAttemptRepository.findByTransactionId(tx.id);
          const matchedAttempt = attempts.find((a) => a.gatewayReference === tx.gatewayReference) || null;

          await applyGatewayOutcome(matchedAttempt, {
            type: normalized.outcome === 'SUCCEEDED' ? 'SUCCEEDED' : normalized.outcome === 'FAILED' ? 'FAILED' : 'UNSUPPORTED',
            gatewayReference: tx.gatewayReference,
            transactionIdHint: tx.id,
            source: 'RECONCILIATION'
          });

          repairs++;
          logger.info({ transactionId: tx.id, outcome: normalized.outcome }, 'Sweeper S4: Reconciled awaiting transaction');
        } catch (err) {
          logger.error({ err, transactionId: tx.id }, 'Sweeper S4 reconciliation failed');
        }
      }
    }

    const durationMs = Date.now() - t0;

    // Record last sweeper run statistics in Redis
    try {
      const redis = getRedisClient();
      await redis.set(
        'payroute:sweeper:last',
        JSON.stringify({
          lastRunAt: now.toISOString(),
          durationMs,
          repairs,
        })
      );
    } catch {}

    return { repairs, durationMs };
  }
}

export const SweepJob = new SweepJobClass();
