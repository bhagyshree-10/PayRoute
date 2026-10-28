import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './infra/logger.js';
import { requestContextMiddleware } from './middleware/requestContext.js';
import { errorHandler, NotFoundError } from './middleware/errorHandler.js';
import { rawBodyMiddleware } from './middleware/rawBody.js';
import { routes } from './routes.js';
import { getMongoDb } from './infra/mongo.js';
import { getRedisClient, checkRedisHealth } from './infra/redis.js';

export function createApp(): express.Application {
  const app = express();

  // Helmet & CORS
  app.use(
    helmet({
      contentSecurityPolicy: false, // CSP enforced at nginx/frontend layer
      crossOriginResourcePolicy: { policy: 'cross-origin' }
    })
  );

  const allowedOrigins = env.FRONTEND_URL.split(',').map((url) => url.trim()).filter(Boolean);

  app.use(
    cors({
      origin: allowedOrigins,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'Idempotency-Key', 'X-Request-Id'],
      exposedHeaders: [
        'Idempotent-Replayed',
        'X-Request-Id',
        'RateLimit-Limit',
        'RateLimit-Remaining',
        'RateLimit-Reset'
      ]
    })
  );

  // Request correlation context
  app.use(requestContextMiddleware);

  // HTTP Request Logging
  app.use(
    pinoHttp({
      logger,
      customAttributeKeys: {
        req: 'request',
        res: 'response',
        err: 'error'
      },
      serializers: {
        req: (req) => ({
          method: req.method,
          url: req.url,
          requestId: req.raw?.requestId
        })
      }
    })
  );

  // Public Health & Readiness Endpoints
  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/api/ready', async (_req, res) => {
    try {
      const db = getMongoDb();
      await db.command({ ping: 1 });
      const redisHealth = await checkRedisHealth(1500);
      if (redisHealth.status !== 'OK') {
        return res.status(503).json({ status: 'unavailable', reason: 'redis_unavailable' });
      }

      return res.status(200).json({ status: 'ready' });
    } catch {
      return res.status(503).json({ status: 'unavailable' });
    }
  });

  // Mount raw body middleware on webhook routes before JSON parsing
  app.use('/api/webhooks', rawBodyMiddleware);

  // Standard JSON body parser
  app.use(express.json({ limit: '100kb' }));

  // Main Router
  app.use('/api', routes);

  // 404 Handler
  app.use((_req, _res, next) => {
    next(new NotFoundError('ENDPOINT_NOT_FOUND', 'Requested API endpoint does not exist'));
  });

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}
