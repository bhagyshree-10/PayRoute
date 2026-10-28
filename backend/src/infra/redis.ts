import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

let sharedRedisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!sharedRedisClient) {
    sharedRedisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    sharedRedisClient.on('error', (err) => {
      logger.error({ err }, 'Redis connection error');
    });

    sharedRedisClient.on('connect', () => {
      logger.info('Connected to Redis');
    });
  }
  return sharedRedisClient;
}

export function createDedicatedRedisConnection(): Redis {
  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  connection.on('error', (err) => {
    logger.error({ err }, 'Dedicated Redis connection error');
  });

  return connection;
}

export async function checkRedisHealth(timeoutMs: number = 2000): Promise<{ status: 'OK' | 'DOWN'; pingMs: number }> {
  const t0 = Date.now();
  let probeClient: Redis | null = null;
  try {
    probeClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: timeoutMs,
      retryStrategy: () => null,
      lazyConnect: false,
    });
    probeClient.on('error', () => {}); // absorb probe errors cleanly
    await Promise.race([
      probeClient.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs)),
    ]);
    return { status: 'OK', pingMs: Date.now() - t0 };
  } catch {
    return { status: 'DOWN', pingMs: Date.now() - t0 };
  } finally {
    if (probeClient) {
      try {
        probeClient.disconnect();
      } catch {}
    }
  }
}

export async function closeRedisConnections(): Promise<void> {
  if (sharedRedisClient) {
    await sharedRedisClient.quit();
    sharedRedisClient = null;
    logger.info('Closed shared Redis connection');
  }
}
