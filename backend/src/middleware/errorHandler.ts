import { Request, Response, NextFunction } from 'express';
import { ApiErrorResponse } from '@payroute/shared';
import { sanitizeErrorMessage } from '../infra/logger.js';

export class AppError extends Error {
  code: string;
  category: string;
  httpStatus: number;
  retryable: boolean;
  details?: any;

  constructor(
    code: string,
    category: string,
    message: string,
    httpStatus: number = 400,
    retryable: boolean = false,
    details?: any
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.category = category;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super('VALIDATION_ERROR', 'validation', message, 400, false, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(code: string = 'AUTHENTICATION_REQUIRED', message: string = 'Authentication credentials required') {
    super(code, 'authentication', message, 401, false);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden resource access') {
    super('FORBIDDEN', 'authentication', message, 403, false);
  }
}

export class NotFoundError extends AppError {
  constructor(code: string = 'PAYMENT_NOT_FOUND', message: string = 'Resource not found') {
    super(code, 'not_found', message, 404, false);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(code, 'conflict', message, 409, false);
  }
}

export class DuplicateRequestError extends AppError {
  constructor(code: string, message: string, httpStatus: number = 422, retryable: boolean = false) {
    super(code, 'duplicate_request', message, httpStatus, retryable);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests, please slow down.') {
    super('RATE_LIMITED', 'rate_limit', message, 429, true);
  }
}

export class DependencyError extends AppError {
  constructor(code: string = 'QUEUE_UNAVAILABLE', message: string = 'Infrastructure dependency unavailable') {
    super(code, 'dependency', message, 503, true);
  }
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.requestId || 'req_unknown';

  if (err instanceof AppError) {
    if (err.httpStatus >= 500) {
      req.log?.error({ err, requestId }, err.message);
    } else {
      req.log?.warn({ err, requestId }, err.message);
    }

    const errorPayload: ApiErrorResponse = {
      error: {
        code: err.code,
        category: err.category,
        message: sanitizeErrorMessage(err.message),
        details: err.details || null,
        retryable: err.retryable,
        requestId,
      },
    };

    return res.status(err.httpStatus).json(errorPayload);
  }

  // Gateway errors (e.g., webhook auth verification failures)
  if (err.name === 'GatewayError' || (err as any).kind) {
    const gwErr = err as any;
    const httpStatus = gwErr.httpStatus || 400;
    const category = gwErr.kind === 'AUTH' ? 'authentication' : 'gateway';

    req.log?.warn({ err, requestId }, gwErr.message);

    const errorPayload: ApiErrorResponse = {
      error: {
        code: gwErr.gatewayCode || `${gwErr.kind || 'GATEWAY'}_ERROR`,
        category,
        message: sanitizeErrorMessage(gwErr.message),
        details: null,
        retryable: gwErr.retryClass === 'RETRY',
        requestId,
      },
    };

    return res.status(httpStatus).json(errorPayload);
  }

  // Unhandled internal errors
  req.log?.error({ err, requestId }, 'Unhandled Internal Server Error');

  const fallbackEnvelope: ApiErrorResponse = {
    error: {
      code: 'INTERNAL_ERROR',
      category: 'internal',
      message: 'An unexpected internal error occurred.',
      details: null,
      retryable: true,
      requestId,
    },
  };

  return res.status(500).json(fallbackEnvelope);
}
