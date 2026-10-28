import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './infra/logger.js';
import { connectMongo, ensureSchema, closeMongo } from './infra/mongo.js';
import { checkRedisHealth, closeRedisConnections } from './infra/redis.js';

async function startServer() {
  try {
    await connectMongo();
    await ensureSchema();

    // Verify Redis connection without hanging boot if Redis is offline
    const redisHealth = await checkRedisHealth(2500);
    if (redisHealth.status === 'OK') {
      logger.info({ pingMs: redisHealth.pingMs }, 'Connected to Redis successfully');
    } else {
      logger.warn(
        'Redis is not reachable on startup. The API server will start in DEGRADED mode (queue-dependent payment attempts and retry worker will require Redis to be running).'
      );
    }

    const app = createApp();

    const server = app.listen(env.PORT, () => {
      logger.info(
        { port: env.PORT, env: env.NODE_ENV },
        `🚀 PayRoute Express API Server running on http://localhost:${env.PORT}`
      );
    });

    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal. Closing server...');
      server.close(async () => {
        logger.info('HTTP server closed.');
        await closeRedisConnections();
        await closeMongo();
        process.exit(0);
      });

      setTimeout(() => {
        logger.error('Forced shutdown after 10s timeout.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    logger.fatal({ err }, 'Failed to start PayRoute API server');
    process.exit(1);
  }
}

startServer();
