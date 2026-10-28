import { Request, Response, NextFunction } from 'express';
import { AuthenticationError, ForbiddenError } from '../../middleware/errorHandler.js';
import { hashApiKey } from './apiKey.js';
import { UserRepository } from './repository.js';
import { verifyAdminToken, AdminJwtPayload } from './jwt.js';
import { UserDoc } from '../types.js';

declare global {
  namespace Express {
    interface Request {
      client?: UserDoc;
      admin?: AdminJwtPayload;
      clientId?: string;
    }
  }
}

export async function requireClient(req: Request, _res: Response, next: NextFunction) {
  const apiKey = req.header('X-API-Key');
  if (!apiKey) {
    return next(new AuthenticationError('INVALID_API_KEY', 'X-API-Key header is required'));
  }

  const keyHash = hashApiKey(apiKey);
  const user = await UserRepository.findByApiKeyHash(keyHash);

  if (!user || user.status !== 'active') {
    return next(new AuthenticationError('INVALID_API_KEY', 'Invalid or disabled API Key'));
  }

  req.client = user;
  req.clientId = user._id;
  next();
}

export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AuthenticationError('INVALID_TOKEN', 'Bearer authorization token required'));
  }

  const token = authHeader.substring(7).trim();
  try {
    const payload = verifyAdminToken(token);
    req.admin = payload;
    next();
  } catch (err: any) {
    return next(new AuthenticationError('INVALID_TOKEN', 'Invalid or expired JWT token'));
  }
}

export async function requireClientOrAdmin(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.header('X-API-Key');
  if (apiKey) {
    return requireClient(req, res, next);
  }

  const authHeader = req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return requireAdmin(req, res, (err) => {
      if (err) return next(err);
      // Admin bypass: clientId comes from query/body if specified or fallback demo client ID
      req.clientId = (req.body?.clientId as string) || (req.query?.clientId as string) || 'usr_01H8X700000000000000000001';
      next();
    });
  }

  return next(new AuthenticationError('AUTHENTICATION_REQUIRED', 'API key (X-API-Key) or Admin token (Authorization) required'));
}
