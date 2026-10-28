import { Queue, Worker, Job } from 'bullmq';
import { createDedicatedRedisConnection } from './redis.js';
import { logger } from './logger.js';

export const QUEUE_NAMES = {
  PAYMENTS: 'payments',
  WEBHOOKS: 'webhooks',
  MAINTENANCE: 'maintenance'
} as const;

let paymentsQueue: Queue | null = null;
let webhooksQueue: Queue | null = null;
let maintenanceQueue: Queue | null = null;

export function getPaymentsQueue(): Queue {
  if (!paymentsQueue) {
    paymentsQueue = new Queue(QUEUE_NAMES.PAYMENTS, {
      connection: createDedicatedRedisConnection(),
      prefix: 'payroute',
      defaultJobOptions: {
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 604800 },
      }
    });
  }
  return paymentsQueue;
}

export function getWebhooksQueue(): Queue {
  if (!webhooksQueue) {
    webhooksQueue = new Queue(QUEUE_NAMES.WEBHOOKS, {
      connection: createDedicatedRedisConnection(),
      prefix: 'payroute',
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 604800 },
      }
    });
  }
  return webhooksQueue;
}

export function getMaintenanceQueue(): Queue {
  if (!maintenanceQueue) {
    maintenanceQueue = new Queue(QUEUE_NAMES.MAINTENANCE, {
      connection: createDedicatedRedisConnection(),
      prefix: 'payroute',
    });
  }
  return maintenanceQueue;
}

export async function enqueuePaymentAttemptJob(
  data: { transactionId: string; attemptNumber: number },
  options: { jobId: string; delay?: number }
): Promise<Job> {
  return getPaymentsQueue().add('payment.attempt', data, {
    jobId: options.jobId,
    delay: options.delay || 0,
    attempts: 1, // PayRoute owns retries
  });
}

export async function enqueueRoutingWaitJob(
  data: { transactionId: string; waitCount: number },
  options: { jobId: string; delay?: number }
): Promise<Job> {
  return getPaymentsQueue().add('payment.routing_wait', data, {
    jobId: options.jobId,
    delay: options.delay || 0,
    attempts: 1,
  });
}

export async function enqueueWebhookProcessJob(
  data: { webhookEventId: string },
  options: { jobId: string }
): Promise<Job> {
  return getWebhooksQueue().add('webhook.process', data, {
    jobId: options.jobId,
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
  });
}

export async function closeQueues(): Promise<void> {
  if (paymentsQueue) await paymentsQueue.close();
  if (webhooksQueue) await webhooksQueue.close();
  if (maintenanceQueue) await maintenanceQueue.close();
  logger.info('Closed BullMQ queues');
}
