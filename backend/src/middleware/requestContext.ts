import { Request, Response, NextFunction } from 'express';
import { generateRequestId } from '../infra/ids.js';
import { logger } from '../infra/logger.js';
import pino from 'pino';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      log: pino.Logger;
      rawBody?: Buffer;
    }
  }
}

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const incomingId = req.header('X-Request-Id');
  const requestId =
    incomingId && /^[A-Za-z0-9_-]{8,64}$/.test(incomingId)
      ? incomingId
      : generateRequestId();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  req.log = logger.child({ requestId });

  next();
}
