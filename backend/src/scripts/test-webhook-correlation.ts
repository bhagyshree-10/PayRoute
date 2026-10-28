import http from 'http';
import Stripe from 'stripe';
import { env } from '../config/env.js';
import { connectMongo, collections, closeMongo } from '../infra/mongo.js';
import { getRedisClient, checkRedisHealth, closeRedisConnections } from '../infra/redis.js';
import { PaymentAttempt, Transaction, WebhookEvent } from '@payroute/shared';

export const TARGET_TXN_ID = 'txn_01M5QDYZ9GCPT8RM0BD6N57ZSD';
export const TARGET_ATT_ID = 'att_01M5QDYZNV8ZDS8TAZBSKCCK8V';
export const TARGET_PI_ID = 'pi_3UU8NRF8v6d32i831EjFW6os';

export function buildSyntheticStripeEvent(eventId: string, txnId: string, piId: string) {
  const nowMs = Date.now();
  return {
    id: eventId,
    object: 'event',
    api_version: '2024-04-10',
    created: Math.floor(nowMs / 1000),
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: piId,
        object: 'payment_intent',
        amount: 632000,
        currency: 'inr',
        status: 'succeeded',
        metadata: {
          payroute_transaction_id: txnId,
        },
      },
    },
  };
}

export function validatePreDispatchBaselines(
  txn: Transaction | null,
  attempt: PaymentAttempt | null,
  expectedPiId: string
): void {
  if (!txn) throw new Error(`ABORT: Target transaction not found in database.`);
  if (txn.status !== 'SUCCESS') throw new Error(`ABORT: Transaction status is "${txn.status}", expected "SUCCESS".`);
  if (txn.attemptCount !== 1) throw new Error(`ABORT: Transaction attemptCount is ${txn.attemptCount}, expected 1.`);
  if (txn.retryCount !== 0) throw new Error(`ABORT: Transaction retryCount is ${txn.retryCount}, expected 0.`);
  if (txn.version !== 4) throw new Error(`ABORT: Transaction version is ${txn.version}, expected 4.`);
  if (txn.gatewayReference !== expectedPiId) {
    throw new Error(`ABORT: Transaction gateway reference is "${txn.gatewayReference}", expected "${expectedPiId}".`);
  }

  if (!attempt) throw new Error(`ABORT: Target PaymentAttempt not found in database.`);
  if (attempt.status !== 'SUCCEEDED') throw new Error(`ABORT: Attempt status is "${attempt.status}", expected "SUCCEEDED".`);
  if (attempt.gatewayReference !== expectedPiId) {
    throw new Error(`ABORT: Attempt gateway reference is "${attempt.gatewayReference}", expected "${expectedPiId}".`);
  }
  if (attempt.latencyMs !== 1637) throw new Error(`ABORT: Attempt latencyMs is ${attempt.latencyMs}, expected 1637.`);
  if (!attempt.finishedAt) throw new Error(`ABORT: Attempt finishedAt is missing.`);
}

export function verifyWebhookOutcome(
  doc: WebhookEvent | null,
  expectedEventId: string,
  expectedTxnId: string,
  expectedAttId: string
): void {
  if (!doc) throw new Error('Monitoring timed out before webhook reached a terminal state.');
  if (doc.eventId !== expectedEventId) {
    throw new Error(`Webhook eventId mismatch: got "${doc.eventId}", expected "${expectedEventId}".`);
  }
  if (doc.status !== 'PROCESSED') {
    throw new Error(`Webhook event status is "${doc.status}", expected "PROCESSED". Error: ${doc.lastError}`);
  }
  if (doc.transactionId !== expectedTxnId) {
    throw new Error(`Webhook linked transaction is "${doc.transactionId}", expected "${expectedTxnId}".`);
  }
  if (doc.attemptId !== expectedAttId) {
    throw new Error(`Webhook linked attempt is "${doc.attemptId}", expected "${expectedAttId}".`);
  }
  if (doc.processingAttempts !== 1) {
    throw new Error(`Webhook processingAttempts is ${doc.processingAttempts}, expected 1.`);
  }
}

export function verifyPostDispatchImmutability(
  preTxn: Transaction,
  postTxn: Transaction | null,
  preAtt: PaymentAttempt,
  postAtt: PaymentAttempt | null,
  expectedPiId: string
): void {
  if (!postTxn) throw new Error('Post-check failed: Transaction was deleted or missing.');
  if (postTxn.id !== preTxn.id) {
    throw new Error(`Transaction id altered: "${postTxn.id}" !== "${preTxn.id}".`);
  }
  if (postTxn.status !== preTxn.status) {
    throw new Error(`Transaction status altered: "${postTxn.status}" !== "${preTxn.status}".`);
  }
  if (postTxn.attemptCount !== preTxn.attemptCount) {
    throw new Error(`Transaction attemptCount altered: ${postTxn.attemptCount} !== ${preTxn.attemptCount}.`);
  }
  if (postTxn.retryCount !== preTxn.retryCount) {
    throw new Error(`Transaction retryCount altered: ${postTxn.retryCount} !== ${preTxn.retryCount}.`);
  }
  if (postTxn.version !== preTxn.version) {
    throw new Error(`Transaction version altered: ${postTxn.version} !== ${preTxn.version}.`);
  }
  if (postTxn.gatewayReference !== expectedPiId) {
    throw new Error(`Transaction gatewayReference altered: "${postTxn.gatewayReference}" !== "${expectedPiId}".`);
  }
  if (JSON.stringify(postTxn.timeline) !== JSON.stringify(preTxn.timeline)) {
    throw new Error('Transaction timeline contents were unexpectedly modified.');
  }

  if (!postAtt) throw new Error('Post-check failed: PaymentAttempt was deleted or missing.');
  if (postAtt.id !== preAtt.id) {
    throw new Error(`PaymentAttempt id altered: "${postAtt.id}" !== "${preAtt.id}".`);
  }
  if (postAtt.status !== preAtt.status) {
    throw new Error(`PaymentAttempt status altered: "${postAtt.status}" !== "${preAtt.status}".`);
  }
  if (postAtt.gatewayReference !== expectedPiId) {
    throw new Error(`PaymentAttempt gatewayReference altered: "${postAtt.gatewayReference}" !== "${expectedPiId}".`);
  }
  if (postAtt.latencyMs !== preAtt.latencyMs) {
    throw new Error(`PaymentAttempt latencyMs altered: ${postAtt.latencyMs} !== ${preAtt.latencyMs}.`);
  }
  if (new Date(postAtt.finishedAt!).toISOString() !== new Date(preAtt.finishedAt!).toISOString()) {
    throw new Error(`PaymentAttempt finishedAt altered: "${postAtt.finishedAt}" !== "${preAtt.finishedAt}".`);
  }
}

export async function runTest(options?: { pollTimeoutMs?: number; pollIntervalMs?: number }) {
  const pollTimeoutMs = options?.pollTimeoutMs ?? 15000;
  const pollIntervalMs = options?.pollIntervalMs ?? 1000;
  console.log('=== PayRoute Webhook Correlation Integration Test ===');
  console.log(`Target Transaction: ${TARGET_TXN_ID}`);
  console.log(`Target Attempt:     ${TARGET_ATT_ID}`);
  console.log(`Target Stripe PI:   ${TARGET_PI_ID}`);
  console.log(`Timestamp:          ${new Date().toISOString()}`);

  // Safety Assertion: Never allow live keys
  if (env.STRIPE_SECRET_KEY.startsWith('sk_live_')) {
    throw new Error('CRITICAL SECURITY ABORT: Live Stripe secret key detected! Test mode only.');
  }

  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('ABORT: STRIPE_WEBHOOK_SECRET is not configured.');
  }
  console.log('✓ Credentials verified in test mode (signing secret is configured).');

  let redisConnected = false;
  let mongoConnected = false;

  try {
    // 1. Pre-flight Health & Baseline Capture
    console.log('\n[Pre-flight 1/4] Connecting to MongoDB and capturing baseline snapshots...');
    await connectMongo();
    mongoConnected = true;

    const preTxn = (await collections.transactions().findOne({ id: TARGET_TXN_ID })) as unknown as Transaction | null;
    const preAtt = (await collections.paymentAttempts().findOne({ id: TARGET_ATT_ID })) as unknown as PaymentAttempt | null;

    validatePreDispatchBaselines(preTxn, preAtt, TARGET_PI_ID);
    console.log(`✓ Baseline captured and verified:`);
    console.log(`  Txn: id=${preTxn!.id}, status=${preTxn!.status}, attemptCount=${preTxn!.attemptCount}, version=${preTxn!.version}, timelineLength=${preTxn!.timeline?.length}`);
    console.log(`  Att: id=${preAtt!.id}, status=${preAtt!.status}, gatewayReference=${preAtt!.gatewayReference}, latencyMs=${preAtt!.latencyMs}`);

    console.log('\n[Pre-flight 2/4] Checking Redis connection and BullMQ worker heartbeat...');
    const redisHealth = await checkRedisHealth(2500);
    if (redisHealth.status !== 'OK') throw new Error(`ABORT: Redis is unreachable (${redisHealth.status}).`);
    redisConnected = true;

    const redis = getRedisClient();
    const heartbeatStr = await redis.get('payroute:worker:heartbeat');
    if (!heartbeatStr) throw new Error('ABORT: Worker heartbeat not found. Is the worker running?');
    const heartbeatAgeMs = Date.now() - new Date(heartbeatStr).getTime();
    if (heartbeatAgeMs > 20000) {
      throw new Error(`ABORT: Worker heartbeat is stale (${Math.round(heartbeatAgeMs / 1000)}s old).`);
    }
    console.log(`✓ Redis healthy. Worker heartbeat active (age: ${Math.round(heartbeatAgeMs / 1000)}s).`);

    console.log(`\n[Pre-flight 3/4] Checking API server health on port ${env.PORT}...`);
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

    const apiOk = await checkApiHealth();
    if (!apiOk) throw new Error(`ABORT: API server not responding with 200 on http://localhost:${env.PORT}/api/health.`);
    console.log(`✓ API server is healthy on http://localhost:${env.PORT}.`);

    // 2. Fixture Construction & Collision Check
    console.log('\n[Pre-flight 4/4] Constructing unique Stripe event payload...');
    const nowMs = Date.now();
    const eventId = `evt_test_corr_${nowMs}_${Math.random().toString(36).substring(2, 8)}`;

    const collision = await collections.webhookEvents().findOne({ gateway: 'stripe', eventId });
    if (collision) throw new Error(`ABORT: Event ID collision detected for ${eventId}.`);

    const payload = buildSyntheticStripeEvent(eventId, TARGET_TXN_ID, TARGET_PI_ID);
    const rawBody = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');

    // 3. Signature Generation in Memory (Secrets Redacted / Never Logged)
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: rawBody.toString('utf8'),
      secret: env.STRIPE_WEBHOOK_SECRET,
    });
    console.log(`✓ Constructed payload for ${eventId} (${rawBody.length} bytes) and generated test signature in-memory.`);

    // 4. Dispatch Exactly One Webhook HTTP POST (Safely Handled, No Auto-Resend)
    console.log(`\n=== Dispatching Webhook POST to http://localhost:${env.PORT}/api/webhooks/stripe ===`);
    let dispatchResult: { statusCode: number; body: string } | null = null;
    let dispatchError: Error | null = null;

    try {
      dispatchResult = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
        const req = http.request(
          {
            hostname: 'localhost',
            port: env.PORT,
            path: '/api/webhooks/stripe',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': rawBody.length,
              'Stripe-Signature': signature,
              'User-Agent': 'Stripe/1.0 (+https://stripe.com/docs/webhooks)',
            },
            timeout: 5000,
          },
          (res) => {
            let chunks: Buffer[] = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
              resolve({
                statusCode: res.statusCode || 0,
                body: Buffer.concat(chunks).toString('utf8'),
              });
            });
          }
        );
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Webhook HTTP request timed out after 5000ms.'));
        });
        req.write(rawBody);
        req.end();
      });
    } catch (err: any) {
      dispatchError = err;
      console.warn(`⚠ HTTP request encountered an error or timeout: ${err.message}.`);
      console.warn('Strictly avoiding automatic resend. Proceeding directly to read-only database inspection.');
    }

    if (dispatchResult) {
      console.log(`HTTP Status: ${dispatchResult.statusCode}`);
      console.log(`Response Body: ${dispatchResult.body}`);
      if (dispatchResult.statusCode !== 200) {
        dispatchError = new Error(`Webhook endpoint returned HTTP ${dispatchResult.statusCode}: ${dispatchResult.body}`);
        console.warn(`⚠ Webhook endpoint returned unexpected status HTTP ${dispatchResult.statusCode}.`);
        console.warn('Strictly avoiding automatic resend. Proceeding directly to read-only database inspection.');
      }
    }

    // 5. Bounded Polling for Worker Processing (Max 15s, Strictly Read-Only)
    console.log(`\n=== Monitoring Webhook Processing in MongoDB (Max ${(pollTimeoutMs / 1000).toFixed(0)}s) ===`);
    const pollStart = Date.now();
    let finalWebhookDoc: any = null;

    while (Date.now() - pollStart < pollTimeoutMs) {
      const doc = await collections.webhookEvents().findOne({ gateway: 'stripe', eventId });
      if (doc) {
        console.log(`[+${((Date.now() - pollStart) / 1000).toFixed(1)}s] Webhook status: ${doc.status} | processingAttempts: ${doc.processingAttempts}`);
        if (doc.status === 'PROCESSED' || doc.status === 'FAILED' || doc.status === 'ORPHANED') {
          finalWebhookDoc = doc;
          break;
        }
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    if (dispatchError) {
      if (!finalWebhookDoc) {
        throw new Error(`Ambiguous dispatch: HTTP request failed (${dispatchError.message}) and no webhook document was stored in MongoDB.`);
      } else {
        throw new Error(`Ambiguous dispatch: HTTP request failed (${dispatchError.message}), but webhook document was found in DB with status: ${finalWebhookDoc.status}. Stopped without claiming success.`);
      }
    }

    // 6. Strict Verification: Webhook Linkage and Pre/Post Immutability
    console.log('\n=== Post-Test Verification ===');
    verifyWebhookOutcome(finalWebhookDoc, eventId, TARGET_TXN_ID, TARGET_ATT_ID);

    console.log('1. Webhook Record Verified:');
    console.log(JSON.stringify({
      id: finalWebhookDoc.id,
      eventId: finalWebhookDoc.eventId,
      status: finalWebhookDoc.status,
      processingAttempts: finalWebhookDoc.processingAttempts,
      transactionId: finalWebhookDoc.transactionId,
      attemptId: finalWebhookDoc.attemptId,
      processedAt: finalWebhookDoc.processedAt,
      lastError: finalWebhookDoc.lastError,
    }, null, 2));

    // Fresh Read-Only Capture of Parent Transaction and Payment Attempt
    const postTxn = (await collections.transactions().findOne({ id: TARGET_TXN_ID })) as unknown as Transaction | null;
    const postAtt = (await collections.paymentAttempts().findOne({ id: TARGET_ATT_ID })) as unknown as PaymentAttempt | null;

    verifyPostDispatchImmutability(preTxn!, postTxn, preAtt!, postAtt, TARGET_PI_ID);

    console.log('\n2. Parent Transaction Status Check:');
    console.log(`  id:               ${postTxn?.id}`);
    console.log(`  status:           ${postTxn?.status} (preserved)`);
    console.log(`  attemptCount:     ${postTxn?.attemptCount} (preserved)`);
    console.log(`  retryCount:       ${postTxn?.retryCount} (preserved)`);
    console.log(`  version:          ${postTxn?.version} (preserved)`);
    console.log(`  timeline events:  ${postTxn?.timeline?.length} (all events verified identical)`);

    console.log('\n3. PaymentAttempt Status Check:');
    console.log(`  id:               ${postAtt?.id}`);
    console.log(`  status:           ${postAtt?.status} (preserved)`);
    console.log(`  gatewayReference: ${postAtt?.gatewayReference} (preserved)`);
    console.log(`  latencyMs:        ${postAtt?.latencyMs} (preserved)`);
    console.log(`  finishedAt:       ${postAtt?.finishedAt} (preserved)`);

    console.log('\n🎉 Webhook correlation test PASSED with 100% precision.');
  } finally {
    if (redisConnected) await closeRedisConnections();
    if (mongoConnected) await closeMongo();
  }
}

// Only invoke when executed directly
if (process.argv[1] && process.argv[1].includes('test-webhook-correlation')) {
  runTest().catch((err) => {
    console.error('\n❌ Test aborted with error:', err.message);
    process.exit(1);
  });
}
