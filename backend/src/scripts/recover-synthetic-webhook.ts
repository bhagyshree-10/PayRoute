import { connectMongo, collections, closeMongo } from '../infra/mongo.js';
import { getRedisClient, checkRedisHealth, closeRedisConnections } from '../infra/redis.js';
import { getWebhooksQueue, enqueueWebhookProcessJob } from '../infra/queues.js';
import { Redis } from 'ioredis';

const TARGET_EVENT_ID = 'whe_01M5P6W15NH0QCSVDVZMG63FHW';
const TIMEOUT_MS = 75000;
const POLL_INTERVAL_MS = 1500;

async function runRecovery() {
  console.log('=== PayRoute Controlled Synthetic Webhook Recovery ===');
  console.log(`Target Event ID: ${TARGET_EVENT_ID}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  let dedicatedQueueClient: Redis | null = null;
  const webhooksQueue = getWebhooksQueue();

  try {
    // Obtain reference to the dedicated queue client before or during operations
    dedicatedQueueClient = (await webhooksQueue.client) as unknown as Redis;

    // 1. Health & Preconditions Check
    console.log('\n[Precondition 1/4] Checking infrastructure health...');
    await connectMongo();
    const redisHealth = await checkRedisHealth(2500);
    if (redisHealth.status !== 'OK') {
      throw new Error(`ABORT: Redis is unreachable (${redisHealth.status})`);
    }
    const sharedRedis = getRedisClient();
    const heartbeat = await sharedRedis.get('payroute:worker:heartbeat');
    if (!heartbeat) {
      throw new Error('ABORT: Worker heartbeat not found. Is the worker running?');
    }
    const heartbeatAgeMs = Date.now() - new Date(heartbeat).getTime();
    if (heartbeatAgeMs > 20000) {
      throw new Error(`ABORT: Worker heartbeat is stale (${Math.round(heartbeatAgeMs / 1000)}s old).`);
    }
    console.log(`✓ Redis & Mongo healthy. Worker heartbeat active (age: ${Math.round(heartbeatAgeMs / 1000)}s).`);

    // 2. MongoDB Event Precondition Check
    console.log('\n[Precondition 2/4] Validating target webhook event in MongoDB...');
    const mongoEvent = await collections.webhookEvents().findOne({
      $or: [{ id: TARGET_EVENT_ID }, { _id: TARGET_EVENT_ID as any }]
    });

    if (!mongoEvent) {
      throw new Error(`ABORT: Webhook event "${TARGET_EVENT_ID}" not found in MongoDB.`);
    }
    if (mongoEvent.id !== TARGET_EVENT_ID) {
      throw new Error(`ABORT: Event ID mismatch: expected "${TARGET_EVENT_ID}", got "${mongoEvent.id}".`);
    }
    if (mongoEvent.status !== 'RECEIVED') {
      throw new Error(`ABORT: Precondition failed: status is "${mongoEvent.status}", expected "RECEIVED".`);
    }
    if (mongoEvent.processingAttempts !== 0) {
      throw new Error(`ABORT: Precondition failed: processingAttempts is ${mongoEvent.processingAttempts}, expected 0.`);
    }
    if ((mongoEvent as any).transactionId || (mongoEvent as any).attemptId) {
      throw new Error(`ABORT: Precondition failed: event is linked to transaction or attempt.`);
    }
    console.log(
      `✓ MongoDB event verified: id=${mongoEvent.id}, status=${mongoEvent.status}, ` +
      `processingAttempts=${mongoEvent.processingAttempts}, duplicateCount=${mongoEvent.duplicateCount}`
    );

    // 3. BullMQ Job Precondition Check
    console.log('\n[Precondition 3/4] Validating BullMQ job state in Redis...');
    const existingJob = await webhooksQueue.getJob(TARGET_EVENT_ID);
    if (!existingJob) {
      throw new Error(`ABORT: BullMQ job "${TARGET_EVENT_ID}" not found in webhooks queue.`);
    }
    if (existingJob.id !== TARGET_EVENT_ID) {
      throw new Error(`ABORT: BullMQ job ID mismatch: expected "${TARGET_EVENT_ID}", got "${existingJob.id}".`);
    }
    const existingJobState = await existingJob.getState();
    if (existingJobState !== 'completed') {
      throw new Error(`ABORT: Precondition failed: job state is "${existingJobState}", expected "completed".`);
    }
    console.log(`✓ BullMQ job verified: id=${existingJob.id}, state=${existingJobState}, attemptsMade=${existingJob.attemptsMade}`);

    // 4. Remove Completed Job
    console.log('\n[Step 1/2] Removing verified completed BullMQ job...');
    await existingJob.remove();
    console.log(`✓ Successfully removed completed BullMQ job "${TARGET_EVENT_ID}".`);

    // Confirm removal
    const postRemovalJob = await webhooksQueue.getJob(TARGET_EVENT_ID);
    if (postRemovalJob) {
      throw new Error(`ABORT: Job "${TARGET_EVENT_ID}" still exists after remove call!`);
    }
    console.log(`✓ Confirmed job is no longer present in BullMQ queue.`);

    // 5. Re-Enqueue Webhook Process Job
    console.log('\n[Step 2/2] Re-enqueuing event via enqueueWebhookProcessJob...');
    const newJob = await enqueueWebhookProcessJob(
      { webhookEventId: TARGET_EVENT_ID },
      { jobId: TARGET_EVENT_ID }
    );
    console.log(`✓ Enqueued new job: id=${newJob.id}, name=${newJob.name}`);

    // 6. Monitor Processing & Retries
    console.log(`\n=== Monitoring Processing (Max ${TIMEOUT_MS / 1000}s) ===`);
    const startTime = Date.now();
    let terminalReached = false;
    let pollCount = 0;
    const history: Array<{
      timeMs: number;
      eventStatus: string;
      processingAttempts: number;
      jobState: string | null;
      jobAttemptsMade: number | null;
      lastError: string | null;
    }> = [];

    while (Date.now() - startTime < TIMEOUT_MS) {
      pollCount++;
      const elapsedMs = Date.now() - startTime;

      const currentEvent = await collections.webhookEvents().findOne({
        $or: [{ id: TARGET_EVENT_ID }, { _id: TARGET_EVENT_ID as any }]
      });

      const currentJob = await webhooksQueue.getJob(TARGET_EVENT_ID);
      const currentJobState = currentJob ? await currentJob.getState() : null;
      const currentAttemptsMade = currentJob ? currentJob.attemptsMade : null;

      const snapshot = {
        timeMs: elapsedMs,
        eventStatus: currentEvent?.status || 'NOT_FOUND',
        processingAttempts: currentEvent?.processingAttempts ?? -1,
        jobState: currentJobState,
        jobAttemptsMade: currentAttemptsMade,
        lastError: currentEvent?.lastError || null,
      };

      const prev = history[history.length - 1];
      const hasChanged =
        !prev ||
        prev.eventStatus !== snapshot.eventStatus ||
        prev.processingAttempts !== snapshot.processingAttempts ||
        prev.jobState !== snapshot.jobState ||
        prev.jobAttemptsMade !== snapshot.jobAttemptsMade;

      history.push(snapshot);

      if (hasChanged) {
        console.log(
          `[+${(elapsedMs / 1000).toFixed(1)}s] ` +
          `Status: ${snapshot.eventStatus} | ` +
          `processingAttempts: ${snapshot.processingAttempts} | ` +
          `Job State: ${snapshot.jobState} (attemptsMade: ${snapshot.jobAttemptsMade}) | ` +
          `lastError: ${snapshot.lastError ? `"${snapshot.lastError}"` : 'null'}`
        );
      }

      if (snapshot.eventStatus === 'ORPHANED') {
        console.log(`\n✓ Genuine terminal state "ORPHANED" reached at +${(elapsedMs / 1000).toFixed(1)}s!`);
        terminalReached = true;
        break;
      }

      if (snapshot.eventStatus === 'PROCESSED') {
        console.log(`\n⚠ Event marked "PROCESSED" at +${(elapsedMs / 1000).toFixed(1)}s.`);
        terminalReached = true;
        break;
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    if (!terminalReached) {
      console.log(`\n⏱ Monitoring timeout (${TIMEOUT_MS / 1000}s) reached without terminal state.`);
    }

    console.log('\n=== Recovery Execution Summary ===');
    console.log(`Terminal Reached: ${terminalReached}`);
    console.log(`Total Polls: ${pollCount}`);
    console.log(`Final Event Record:`);
    const finalEvent = await collections.webhookEvents().findOne({
      $or: [{ id: TARGET_EVENT_ID }, { _id: TARGET_EVENT_ID as any }]
    });
    console.log(JSON.stringify(finalEvent, null, 2));
  } finally {
    console.log('\n=== Resource Cleanup ===');
    try {
      if (webhooksQueue) {
        await webhooksQueue.close();
        console.log('✓ Closed BullMQ webhooks queue.');
        const sharedRedis = getRedisClient();
        if (dedicatedQueueClient && dedicatedQueueClient !== sharedRedis) {
          await dedicatedQueueClient.quit();
          console.log('✓ Closed dedicated Redis connection for webhooks queue.');
        }
      }
    } catch (err: any) {
      console.error('Error closing webhooks queue/dedicated Redis:', err.message);
    }

    try {
      await closeRedisConnections();
      console.log('✓ Closed shared Redis connection.');
    } catch (err: any) {
      console.error('Error closing shared Redis:', err.message);
    }

    try {
      await closeMongo();
      console.log('✓ Closed MongoDB connection.');
    } catch (err: any) {
      console.error('Error closing MongoDB:', err.message);
    }
  }
}

runRecovery().catch((err) => {
  console.error('\n❌ Controlled Recovery FAILED with error:', err);
  process.exit(1);
});
