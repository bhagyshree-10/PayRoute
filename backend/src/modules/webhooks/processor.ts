import { collections } from '../../infra/mongo.js';
import { WebhookEventRepository } from './repository.js';
import { PaymentAttemptRepository } from '../attempts/repository.js';
import { applyGatewayOutcome } from '../transactions/applyGatewayOutcome.js';
import { logger } from '../../infra/logger.js';
import { PaymentAttempt, WebhookEvent } from '@payroute/shared';

export class RetryableProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableProcessingError';
  }
}

export class WebhookProcessorClass {
  async runJob(jobData: { webhookEventId: string }): Promise<void> {
    const { webhookEventId } = jobData;
    const now = new Date();

    // 1. Claim event
    const event = await collections.webhookEvents().findOneAndUpdate(
      { $or: [{ id: webhookEventId }, { _id: webhookEventId }], status: { $in: ['RECEIVED', 'FAILED', 'ORPHANED'] } },
      {
        $set: { status: 'PROCESSING', processingStartedAt: now },
        $inc: { processingAttempts: 1 }
      },
      { returnDocument: 'after' }
    );

    if (!event) {
      const existing = await WebhookEventRepository.findById(webhookEventId);
      if (!existing) {
        logger.error({ webhookEventId }, 'WebhookProcessor failed: webhook event not found');
        throw new Error(`Webhook event ${webhookEventId} not found`);
      }

      logger.info(
        { webhookEventId, status: existing.status },
        'WebhookProcessor skipped: event already processing or finished'
      );
      return;
    }

    const snapshot: Record<string, any> = (event.payloadSnapshot as any) || {};
    const gatewayRef =
      (snapshot.object_id as string) ||
      (snapshot.payment_id as string) ||
      (snapshot.order_id as string) ||
      '';

    const txnIdHint =
      (snapshot.metadata?.payroute_transaction_id as string) ||
      (snapshot.notes?.payroute_transaction_id as string) ||
      null;

    // 2. Locate attempt by gateway reference or transaction hint
    let attempt: PaymentAttempt | null = null;
    if (gatewayRef) {
      attempt = await PaymentAttemptRepository.findByGatewayRef(event.gateway, gatewayRef);
    }

    if (!attempt && txnIdHint) {
      const attempts = await PaymentAttemptRepository.findByTransactionId(txnIdHint);
      if (attempts.length > 0) {
        attempt = attempts[attempts.length - 1]; // Latest attempt
      }
    }

    // 3. Handle un-located attempt
    if (!attempt) {
      if (event.processingAttempts < 5) {
        // Webhook beat the worker DB write! Retry job after delay
        await WebhookEventRepository.update(webhookEventId, { status: 'RECEIVED' });
        throw new RetryableProcessingError(`Attempt for ref ${gatewayRef} not found yet; retry processing`);
      }

      // Mark ORPHANED
      await WebhookEventRepository.update(webhookEventId, {
        status: 'ORPHANED',
        lastError: `No matching attempt or transaction found after ${event.processingAttempts} tries`
      });
      logger.warn({ webhookEventId, gatewayRef, eventType: event.eventType }, 'Webhook event marked ORPHANED');
      return;
    }

    // 4. Determine normalized outcome
    let type: 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'UNSUPPORTED' = 'UNSUPPORTED';
    const rawType = (event.eventType || '').toLowerCase();

    if (rawType.includes('succeeded') || rawType.includes('captured') || rawType.includes('order.paid')) {
      type = 'SUCCEEDED';
    } else if (rawType.includes('failed')) {
      type = 'FAILED';
    } else if (rawType.includes('canceled') || rawType.includes('cancelled')) {
      type = 'CANCELED';
    }

    if (type === 'UNSUPPORTED') {
      await WebhookEventRepository.update(webhookEventId, {
        status: 'IGNORED',
        processedAt: now,
        transactionId: attempt.transactionId,
        attemptId: attempt.id
      });
      logger.info({ webhookEventId, eventType: event.eventType }, 'Webhook event ignored (unhandled type)');
      return;
    }

    // 5. Apply outcome to state machine
    const result = await applyGatewayOutcome(attempt, {
      type,
      gatewayReference: gatewayRef || attempt.gatewayReference || '',
      transactionIdHint: txnIdHint,
      failureCode: snapshot.error?.code || 'WEBHOOK_FAILED',
      source: 'WEBHOOK'
    });

    // 6. Mark PROCESSED
    await WebhookEventRepository.update(webhookEventId, {
      status: 'PROCESSED',
      processedAt: now,
      transactionId: result.transactionId,
      attemptId: attempt.id
    });

    logger.info(
      { webhookEventId, transactionId: result.transactionId, eventType: event.eventType, status: result.status },
      'Webhook outcome applied successfully to transaction'
    );
  }
}

export const WebhookProcessor = new WebhookProcessorClass();
