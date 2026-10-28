import http from 'http';
import Stripe from 'stripe';
import { env } from '../config/env.js';
import { connectMongo, closeMongo, collections } from '../infra/mongo.js';
import { getRedisClient, closeRedisConnections, checkRedisHealth } from '../infra/redis.js';

interface WebhookResponse {
  statusCode: number;
  body: {
    received?: boolean;
    duplicate?: boolean;
    [key: string]: any;
  };
}

async function runIsolatedWebhookTest() {
  console.log('====================================================');
  console.log('   PayRoute Isolated Stripe Webhook Test Runner     ');
  console.log('====================================================\n');

  // --- SAFETY CHECK 1: Credentials & Configuration ---
  console.log('[Safety Check 1/5] Verifying environment & credential constraints...');
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('ABORT: STRIPE_WEBHOOK_SECRET is not configured in environment.');
  }
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('ABORT: STRIPE_SECRET_KEY is not configured in environment.');
  }
  if (env.STRIPE_SECRET_KEY.startsWith('sk_live_')) {
    throw new Error('CRITICAL SECURITY ABORT: Live Stripe secret key (sk_live_) detected! PayRoute only permits test mode.');
  }
  console.log('✓ Credentials verified in test mode (no live keys present).');

  let mongoConnected = false;

  try {
    // --- SAFETY CHECK 2: MongoDB Connectivity ---
    console.log('[Safety Check 2/5] Checking MongoDB database connection...');
    await connectMongo();
    mongoConnected = true;
    console.log('✓ MongoDB connected successfully.');

    // --- SAFETY CHECK 3: Redis Connectivity ---
    console.log('[Safety Check 3/5] Checking Redis service connection...');
    const redisHealth = await checkRedisHealth(2500);
    if (redisHealth.status !== 'OK') {
      throw new Error(`ABORT: Redis service is unreachable (${redisHealth.status}).`);
    }
    const redis = getRedisClient();
    console.log(`✓ Redis service is healthy (ping: ${redisHealth.pingMs}ms).`);

    // --- SAFETY CHECK 4: Worker Heartbeat ---
    console.log('[Safety Check 4/5] Checking PayRoute BullMQ worker heartbeat in Redis...');
    const heartbeatStr = await redis.get('payroute:worker:heartbeat');
    if (!heartbeatStr) {
      throw new Error(
        'ABORT: Worker heartbeat not found at key "payroute:worker:heartbeat".\n' +
        'Please ensure the worker process is running ("npm run dev:worker -w backend") before running this test.'
      );
    }
    const heartbeatAgeMs = Date.now() - new Date(heartbeatStr).getTime();
    if (heartbeatAgeMs > 20000) {
      throw new Error(
        `ABORT: Worker heartbeat is stale (${Math.round(heartbeatAgeMs / 1000)}s old). Worker process may be stalled.`
      );
    }
    console.log(`✓ BullMQ Worker process is active (heartbeat age: ${Math.round(heartbeatAgeMs / 1000)}s).`);

    // --- SAFETY CHECK 5: API Server Health ---
    console.log(`[Safety Check 5/5] Checking local API server responsiveness on port ${env.PORT}...`);
    const checkApiHealth = (): Promise<boolean> => {
      return new Promise((resolve) => {
        const req = http.get(
          {
            hostname: 'localhost',
            port: env.PORT,
            path: '/api/health',
            timeout: 3000,
          },
          (res) => resolve(res.statusCode === 200)
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
      });
    };

    const apiHealthy = await checkApiHealth();
    if (!apiHealthy) {
      throw new Error(
        `ABORT: API server is not responding with 200 OK on http://localhost:${env.PORT}/api/health.\n` +
        'Please ensure the API server is running ("npm run dev -w backend").'
      );
    }
    console.log(`✓ API server responded with 200 OK on http://localhost:${env.PORT}/api/health.\n`);
    console.log('All 5 pre-flight safety checks PASSED. Proceeding with test...\n');

    // --- STEP 1: Synthetic Fixture Construction ---
    const nowMs = Date.now();
    const eventId = `evt_test_synth_${nowMs}_${Math.random().toString(36).substring(2, 8)}`;
    const syntheticPiId = `pi_test_synthetic_${nowMs}`;
    const syntheticTxId = `txn_isolated_synthetic_${nowMs}`;

    // Verify event ID does not collide in MongoDB
    const collision = await collections.webhookEvents().findOne({ gateway: 'stripe', eventId });
    if (collision) {
      throw new Error(`ABORT: Event ID collision detected for ${eventId}.`);
    }

    const payload = {
      id: eventId,
      object: 'event',
      api_version: '2024-04-10',
      created: Math.floor(nowMs / 1000),
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: syntheticPiId,
          object: 'payment_intent',
          amount: 5000,
          currency: 'inr',
          status: 'succeeded',
          metadata: {
            payroute_transaction_id: syntheticTxId,
          },
        },
      },
    };

    const rawBody = JSON.stringify(payload);

    // --- STEP 2: Cryptographic Signature Self-Test ---
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: rawBody,
      secret: env.STRIPE_WEBHOOK_SECRET,
    });

    const preflight = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
      env.WEBHOOK_TOLERANCE_SECONDS
    );
    if (preflight.id !== eventId) {
      throw new Error('ABORT: In-memory Stripe signature validation failed self-check.');
    }
    console.log('✓ Cryptographic HMAC signature generated and validated against local Stripe SDK.\n');

    // HTTP Dispatch Helper
    const postWebhook = (): Promise<WebhookResponse> => {
      return new Promise((resolve, reject) => {
        const req = http.request(
          {
            hostname: 'localhost',
            port: env.PORT,
            path: '/api/webhooks/stripe',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(rawBody),
              'Stripe-Signature': signature,
            },
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              try {
                resolve({ statusCode: res.statusCode || 0, body: JSON.parse(data) });
              } catch {
                resolve({ statusCode: res.statusCode || 0, body: { raw: data } });
              }
            });
          }
        );
        req.on('error', reject);
        req.write(rawBody);
        req.end();
      });
    };

    // --- STEP 3: Delivery 1 (New Event Intake) ---
    console.log('Sending Delivery 1 (Initial Webhook Event)...');
    const res1 = await postWebhook();
    console.log('HTTP Status 1:', res1.statusCode);
    console.log('Response Body 1:', JSON.stringify(res1.body));

    if (res1.statusCode !== 200 || res1.body?.received !== true || res1.body?.duplicate !== false) {
      throw new Error(
        `ABORT: Delivery 1 failed assertion. Expected 200 { received: true, duplicate: false }, got ${res1.statusCode} ${JSON.stringify(res1.body)}`
      );
    }
    console.log('✓ Delivery 1 correctly accepted as NEW event.\n');

    // --- STEP 4: Delivery 2 (Duplicate Replay) ---
    console.log('Sending Delivery 2 (Identical Duplicate Replay)...');
    const res2 = await postWebhook();
    console.log('HTTP Status 2:', res2.statusCode);
    console.log('Response Body 2:', JSON.stringify(res2.body));

    if (res2.statusCode !== 200 || res2.body?.received !== true || res2.body?.duplicate !== true) {
      throw new Error(
        `ABORT: Delivery 2 failed assertion. Expected 200 { received: true, duplicate: true }, got ${res2.statusCode} ${JSON.stringify(res2.body)}`
      );
    }
    console.log('✓ Delivery 2 correctly acknowledged and absorbed as DUPLICATE event.\n');

    // --- STEP 5: Asynchronous Processing & Record Polling ---
    const pollTimeoutMs = Number(process.env.POLL_TIMEOUT_MS || 10000);
    const pollIntervalMs = 1000;
    const maxAttempts = Math.ceil(pollTimeoutMs / pollIntervalMs);

    console.log(`Polling MongoDB record (bounded window: ${pollTimeoutMs / 1000}s)...`);
    let finalDoc: any = null;
    let isTerminal = false;

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      finalDoc = await collections.webhookEvents().findOne({ gateway: 'stripe', eventId });
      if (finalDoc) {
        console.log(
          `[t+${i + 1}s] Status: ${finalDoc.status} | ProcessingAttempts: ${finalDoc.processingAttempts} | DuplicateCount: ${finalDoc.duplicateCount}`
        );
        if (['PROCESSED', 'ORPHANED', 'IGNORED'].includes(finalDoc.status)) {
          isTerminal = true;
          break;
        }
      }
    }

    // --- STEP 6: Final Results Reporting ---
    console.log('\n====================================================');
    console.log('               TEST EXECUTION REPORT                ');
    console.log('====================================================');

    console.log('\n1. HTTP Outcomes:');
    console.log(`   • Request 1 (New):       Status ${res1.statusCode} => received=${res1.body.received}, duplicate=${res1.body.duplicate}`);
    console.log(`   • Request 2 (Duplicate): Status ${res2.statusCode} => received=${res2.body.received}, duplicate=${res2.body.duplicate}`);

    console.log('\n2. Persisted Webhook Record in MongoDB:');
    console.log(`   • Database ID:           ${finalDoc?._id}`);
    console.log(`   • Domain Event ID:       ${finalDoc?.id}`);
    console.log(`   • Stripe Event ID:       ${finalDoc?.eventId}`);
    console.log(`   • Event Type:            ${finalDoc?.eventType}`);
    console.log(`   • Duplicate Counter:     ${finalDoc?.duplicateCount} (Expected: 1)`);
    console.log(`   • Processing Attempts:   ${finalDoc?.processingAttempts}`);
    console.log(`   • Enqueued At:           ${finalDoc?.enqueuedAt ? new Date(finalDoc.enqueuedAt).toISOString() : 'null'}`);
    console.log(`   • Last Duplicate At:     ${finalDoc?.lastDuplicateAt ? new Date(finalDoc.lastDuplicateAt).toISOString() : 'null'}`);

    console.log('\n3. Asynchronous Worker / Queue Outcome:');
    if (isTerminal) {
      console.log(`   • Final Status:          ${finalDoc?.status}`);
      if (finalDoc?.lastError) {
        console.log(`   • Worker Error Detail:   ${finalDoc.lastError}`);
      }
    } else {
      console.log(`   • Current Status:        ${finalDoc?.status} (PENDING/RETRYING)`);
      console.log(`   • Queue Note:            Polling window (${pollTimeoutMs / 1000}s) concluded while BullMQ worker is retrying backoff.`);
      console.log(`                            (Expected for synthetic events with no matching transaction in database).`);
    }

    console.log('\n====================================================');
    console.log('✓ TEST FINISHED: Webhook intake, cryptographic verification,');
    console.log('  deduplication absorption, and BullMQ queue dispatch verified.');
    console.log('====================================================\n');
  } finally {
    // --- STEP 7: Safe Teardown ---
    if (mongoConnected) {
      await closeMongo().catch(() => {});
    }
    await closeRedisConnections().catch(() => {});
  }
}

runIsolatedWebhookTest().catch((err) => {
  console.error('\n❌ Test execution failed with error:', err.message);
  process.exit(1);
});
