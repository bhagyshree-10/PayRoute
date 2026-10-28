import { GatewayRegistry } from '../gateways/registry.js';
import { generateWebhookEventId } from '../../infra/ids.js';
import { WebhookEventRepository } from './repository.js';
import { enqueueWebhookProcessJob } from '../../infra/queues.js';
import { GatewayName, WebhookEvent } from '@payroute/shared';
import { logger } from '../../infra/logger.js';

export class WebhookIntakeClass {
  async handle(
    gatewayName: GatewayName,
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
    requestId: string
  ): Promise<{ received: boolean; duplicate: boolean }> {
    const gatewayAdapter = GatewayRegistry.getGateway(gatewayName);

    // 1. Signature Verification
    const verified = gatewayAdapter.verifyWebhook(rawBody, headers);

    const now = new Date();
    const webhookEventId = generateWebhookEventId();

    const newRecord: WebhookEvent = {
      id: webhookEventId,
      gateway: gatewayName,
      eventId: verified.eventId,
      eventType: verified.eventType,
      status: 'RECEIVED',
      payloadSnapshot: verified.payloadSnapshot,
      rawBodyHash: verified.rawBodyHash,
      transactionId: null,
      attemptId: null,
      duplicateCount: 0,
      lastDuplicateAt: null,
      processingAttempts: 0,
      lastError: null,
      requestId,
      receivedAt: now,
      enqueuedAt: null,
      processingStartedAt: null,
      processedAt: null,
      failedAt: null,
    };

    // 2. Durable Deduplicated Insert
    try {
      await WebhookEventRepository.insert(newRecord);
    } catch (err: any) {
      if (err.code === 11000) {
        // Duplicate delivery absorbed
        await WebhookEventRepository.incrementDuplicate(gatewayName, verified.eventId);
        logger.info(
          { gateway: gatewayName, eventId: verified.eventId, eventType: verified.eventType },
          'Duplicate webhook event absorbed and acknowledged with 200 OK'
        );
        return { received: true, duplicate: true };
      }
      throw err;
    }

    // 3. Enqueue Background Processing Job
    try {
      await enqueueWebhookProcessJob(
        { webhookEventId },
        { jobId: webhookEventId }
      );

      await WebhookEventRepository.update(webhookEventId, { enqueuedAt: new Date() });
    } catch (queueErr: any) {
      logger.error(
        { queueErr, webhookEventId },
        'Redis enqueue failed for webhook event; event persisted in MongoDB for sweeper recovery'
      );
    }

    return { received: true, duplicate: false };
  }
}

export const WebhookIntake = new WebhookIntakeClass();
