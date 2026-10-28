import { Worker, Job } from 'bullmq';
import { env } from './config/env.js';
import { connectMongo, ensureSchema, closeMongo } from './infra/mongo.js';
import { createDedicatedRedisConnection, getRedisClient, checkRedisHealth, closeRedisConnections } from './infra/redis.js';
import { QUEUE_NAMES, closeQueues, getMaintenanceQueue } from './infra/queues.js';
import { AttemptExecutor } from './modules/attempts/attemptExecutor.js';
import { WebhookProcessor } from './modules/webhooks/processor.js';
import { SweepJob } from './modules/maintenance/sweep.js';
import { logger } from './infra/logger.js';

let heartbeatTimer: NodeJS.Timeout | null = null;
let paymentsWorker: Worker | null = null;
let webhooksWorker: Worker | null = null;
let maintenanceWorker: Worker | null = null;

async function startWorker() {
  try {
    await connectMongo();
    await ensureSchema();

    const redisHealth = await checkRedisHealth(3000);
    if (redisHealth.status !== 'OK') {
      logger.fatal(
        'Cannot start PayRoute BullMQ worker: Redis service is unreachable. Please verify REDIS_URL is configured and Redis is running.'
      );
      process.exit(1);
    }

    logger.info('Starting PayRoute BullMQ Worker consumers...');

    // 1. Payments Worker
    paymentsWorker = new Worker(
      QUEUE_NAMES.PAYMENTS,
      async (job: Job) => {
        logger.info({ jobId: job.id, name: job.name }, 'Processing payments queue job');
        if (job.name === 'payment.attempt' || job.name === 'payment.routing_wait') {
          await AttemptExecutor.runJob(job.data);
        }
      },
      {
        connection: createDedicatedRedisConnection(),
        prefix: 'payroute',
        concurrency: 5,
        lockDuration: 30000,
        stalledInterval: 30000,
        maxStalledCount: 1,
      }
    );

    // 2. Webhooks Worker
    webhooksWorker = new Worker(
      QUEUE_NAMES.WEBHOOKS,
      async (job: Job) => {
        logger.info({ jobId: job.id, name: job.name }, 'Processing webhooks queue job');
        if (job.name === 'webhook.process') {
          await WebhookProcessor.runJob(job.data);
        }
      },
      {
        connection: createDedicatedRedisConnection(),
        prefix: 'payroute',
        concurrency: 5,
        lockDuration: 30000,
        stalledInterval: 30000,
        maxStalledCount: 1,
      }
    );

    // 3. Maintenance Worker & Repeat Scheduler
    const maintenanceQueue = getMaintenanceQueue();
    await maintenanceQueue.upsertJobScheduler(
      'sweep-schedule',
      { every: 30000 },
      { name: 'maintenance.sweep', data: {} }
    );

    maintenanceWorker = new Worker(
      QUEUE_NAMES.MAINTENANCE,
      async (job: Job) => {
        logger.info({ jobId: job.id, name: job.name }, 'Running maintenance sweeper job');
        if (job.name === 'maintenance.sweep') {
          await SweepJob.run();
        }
      },
      {
        connection: createDedicatedRedisConnection(),
        prefix: 'payroute',
        concurrency: 1,
      }
    );

    // 4. Publish Worker Heartbeat every 5s
    const publishHeartbeat = async () => {
      try {
        const redis = getRedisClient();
        await redis.set('payroute:worker:heartbeat', new Date().toISOString(), 'EX', 15);
      } catch (err) {
        logger.error({ err }, 'Worker heartbeat update failed');
      }
    };

    await publishHeartbeat();
    heartbeatTimer = setInterval(publishHeartbeat, 5000);

    logger.info('🚀 PayRoute Worker processes started and listening for jobs.');

    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Worker received shutdown signal. Closing workers...');
      if (heartbeatTimer) clearInterval(heartbeatTimer);

      if (paymentsWorker) await paymentsWorker.close();
      if (webhooksWorker) await webhooksWorker.close();
      if (maintenanceWorker) await maintenanceWorker.close();

      await closeQueues();
      await closeRedisConnections();
      await closeMongo();

      logger.info('Worker processes closed cleanly.');
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    logger.fatal({ err }, 'Failed to start PayRoute worker');
    process.exit(1);
  }
}

startWorker();
