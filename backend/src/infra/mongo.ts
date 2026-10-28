import dns from 'dns';
import { MongoClient, Db, Collection } from 'mongodb';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import {
  GatewayHealth,
  IdempotencyRecord,
  PaymentAttempt,
  RetryJobRecord,
  Transaction,
  UserDoc,
  WebhookEvent
} from '@payroute/shared';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectMongo(): Promise<Db> {
  if (db) return db;

  logger.info({ uri: env.MONGODB_URI.replace(/:([^@]+)@/, ':****@') }, 'Connecting to MongoDB...');
  try {
    client = new MongoClient(env.MONGODB_URI);
    await client.connect();
  } catch (err: any) {
    if (
      err?.message?.includes('querySrv') ||
      err?.message?.includes('ECONNREFUSED') ||
      err?.code === 'ECONNREFUSED'
    ) {
      logger.warn('Local DNS failed on SRV query; falling back to standard public DNS resolvers (8.8.8.8)...');
      try {
        dns.setServers(['8.8.8.8', '1.1.1.1']);
      } catch {}
      client = new MongoClient(env.MONGODB_URI);
      await client.connect();
    } else {
      throw err;
    }
  }

  db = client.db(env.MONGODB_DB);
  logger.info({ dbName: env.MONGODB_DB }, 'Connected to MongoDB successfully');
  return db;
}

export async function checkMongoHealth(): Promise<{ status: 'OK' | 'DOWN'; pingMs: number }> {
  const t0 = Date.now();
  try {
    const database = await connectMongo();
    await database.command({ ping: 1 });
    return { status: 'OK', pingMs: Date.now() - t0 };
  } catch {
    return { status: 'DOWN', pingMs: Date.now() - t0 };
  }
}

export function getMongoDb(): Db {
  if (!db) {
    throw new Error('MongoDB not initialized. Call connectMongo() first.');
  }
  return db;
}

export function getMongoClient(): MongoClient {
  if (!client) {
    throw new Error('MongoDB client not initialized. Call connectMongo() first.');
  }
  return client;
}

export function getCollection<T extends { [key: string]: any }>(name: string): Collection<T> {
  return getMongoDb().collection<T>(name);
}

export const collections = {
  users: () => getCollection<UserDoc>('users'),
  transactions: () => getCollection<Transaction>('transactions'),
  paymentAttempts: () => getCollection<PaymentAttempt>('paymentAttempts'),
  webhookEvents: () => getCollection<WebhookEvent>('webhookEvents'),
  idempotencyKeys: () => getCollection<IdempotencyRecord>('idempotencyKeys'),
  gatewayHealth: () => getCollection<GatewayHealth>('gatewayHealth'),
  retryJobs: () => getCollection<RetryJobRecord>('retryJobs'),
};

export async function ensureSchema(): Promise<void> {
  const database = getMongoDb();
  logger.info('Ensuring MongoDB collections, indexes, and schema validators...');

  // 1. users
  const usersColl = database.collection('users');
  await usersColl.createIndex(
    { email: 1 },
    { unique: true, partialFilterExpression: { email: { $type: 'string' } } }
  );
  await usersColl.createIndex(
    { apiKeyHash: 1 },
    { unique: true, partialFilterExpression: { apiKeyHash: { $type: 'string' } } }
  );

  // 2. transactions
  const txnColl = database.collection('transactions');
  await txnColl.createIndex({ id: 1 }, { unique: true, sparse: true });
  await txnColl.createIndex({ clientId: 1, createdAt: -1 });
  await txnColl.createIndex({ status: 1, createdAt: -1 });
  await txnColl.createIndex({ status: 1, updatedAt: 1 });
  await txnColl.createIndex({ finalGateway: 1, createdAt: -1 });
  await txnColl.createIndex({ createdAt: -1 });
  await txnColl.createIndex({ flags: 1 }, { sparse: true });

  // 3. paymentAttempts
  const attColl = database.collection('paymentAttempts');
  await attColl.createIndex({ id: 1 }, { unique: true, sparse: true });
  await attColl.createIndex({ transactionId: 1, attemptNumber: 1 }, { unique: true });
  await attColl.createIndex(
    { gateway: 1, gatewayReference: 1 },
    { unique: true, partialFilterExpression: { gatewayReference: { $type: 'string' } } }
  );
  await attColl.createIndex({ gateway: 1, startedAt: -1 });
  await attColl.createIndex({ status: 1, startedAt: 1 });

  // 4. webhookEvents
  const wheColl = database.collection('webhookEvents');
  await wheColl.createIndex({ id: 1 }, { unique: true, sparse: true });
  await wheColl.createIndex({ gateway: 1, eventId: 1 }, { unique: true });
  await wheColl.createIndex({ status: 1, receivedAt: -1 });
  await wheColl.createIndex({ transactionId: 1 });
  await wheColl.createIndex({ receivedAt: -1 });
  const retentionSeconds = env.WEBHOOK_RETENTION_DAYS * 86400;
  await wheColl.createIndex({ receivedAt: 1 }, { expireAfterSeconds: retentionSeconds });

  // 5. idempotencyKeys
  const idemColl = database.collection('idempotencyKeys');
  await idemColl.createIndex({ clientId: 1, key: 1 }, { unique: true });
  await idemColl.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  // 6. retryJobs
  const rjColl = database.collection('retryJobs');
  await rjColl.createIndex({ queueJobId: 1 }, { unique: true });
  await rjColl.createIndex({ status: 1, scheduledFor: 1 });
  await rjColl.createIndex({ transactionId: 1, createdAt: 1 });

  // 7. Upsert initial gatewayHealth documents for Stripe and Razorpay
  const gwHealthColl = database.collection<GatewayHealth>('gatewayHealth');
  const now = new Date();

  for (const gwName of ['stripe', 'razorpay'] as const) {
    await gwHealthColl.updateOne(
      { _id: gwName as any },
      {
        $setOnInsert: {
          _id: gwName as any,
          enabled: true,
          state: 'CLOSED',
          consecutiveFailures: 0,
          successCount: 0,
          failureCount: 0,
          lastSuccessAt: null,
          lastFailureAt: null,
          lastFailureReason: null,
          openedAt: null,
          nextProbeAt: null,
          probeStartedAt: null,
          probeInFlight: false,
          recentTransitions: [],
          simulation: { mode: 'NONE', expiresAt: null },
          updatedAt: now,
        },
      },
      { upsert: true }
    );
  }

  logger.info('MongoDB schema, indexes, and initial records ensured successfully');
}

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    logger.info('Closed MongoDB connection');
  }
}
