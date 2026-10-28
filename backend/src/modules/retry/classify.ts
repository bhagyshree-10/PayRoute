import { ErrorKind, RetryClass } from '@payroute/shared';
import { GatewayError } from '../gateways/types.js';

export interface ClassificationResult {
  kind: ErrorKind;
  retryClass: RetryClass;
  ambiguous: boolean;
  countsAgainstBreaker: boolean;
  httpStatus?: number;
  gatewayCode?: string;
  retryAfterMs?: number;
}

export function classify(error: unknown): ClassificationResult {
  if (error instanceof GatewayError) {
    return {
      kind: error.kind,
      retryClass: error.retryClass,
      ambiguous: error.ambiguous,
      countsAgainstBreaker: error.countsAgainstBreaker,
      httpStatus: error.httpStatus,
      gatewayCode: error.gatewayCode,
      retryAfterMs: error.retryAfterMs,
    };
  }

  const errObj = error as any;
  const message = String(errObj?.message || '').toLowerCase();
  const code = String(errObj?.code || errObj?.raw?.code || '').toLowerCase();
  const status = errObj?.status || errObj?.statusCode || errObj?.httpStatus;

  // Timeout
  if (errObj?.name === 'AbortError' || code === 'etimedout' || message.includes('timeout')) {
    return {
      kind: 'TIMEOUT',
      retryClass: 'RETRY',
      ambiguous: true,
      countsAgainstBreaker: true,
      httpStatus: status,
      gatewayCode: code
    };
  }

  // Network errors
  if (code === 'econnreset' || code === 'econnrefused' || code === 'enotfound' || message.includes('fetch failed')) {
    const isReset = code === 'econnreset';
    return {
      kind: 'NETWORK',
      retryClass: 'RETRY',
      ambiguous: isReset,
      countsAgainstBreaker: true,
      httpStatus: status,
      gatewayCode: code
    };
  }

  // HTTP status codes
  if (status) {
    if (status === 429 || code.includes('rate_limit')) {
      return {
        kind: 'RATE_LIMITED',
        retryClass: 'RETRY',
        ambiguous: false,
        countsAgainstBreaker: true,
        httpStatus: 429,
        gatewayCode: code,
        retryAfterMs: errObj?.retryAfterMs
      };
    }
    if (status === 401 || status === 403) {
      return {
        kind: 'AUTH',
        retryClass: 'FALLBACK',
        ambiguous: false,
        countsAgainstBreaker: true,
        httpStatus: status,
        gatewayCode: code
      };
    }
    if (status >= 500 && status <= 509) {
      return {
        kind: 'SERVER_ERROR',
        retryClass: 'RETRY',
        ambiguous: false,
        countsAgainstBreaker: true,
        httpStatus: status,
        gatewayCode: code
      };
    }
    if (status === 400 || status === 422) {
      if (code.includes('card') || code.includes('decline') || message.includes('decline')) {
        return {
          kind: 'CARD_DECLINED',
          retryClass: 'TERMINAL',
          ambiguous: false,
          countsAgainstBreaker: false,
          httpStatus: status,
          gatewayCode: code
        };
      }
      return {
        kind: 'INVALID_REQUEST',
        retryClass: 'TERMINAL',
        ambiguous: false,
        countsAgainstBreaker: false,
        httpStatus: status,
        gatewayCode: code
      };
    }
  }

  // Card declined strings
  if (code.includes('card_declined') || code.includes('insufficient_funds') || message.includes('decline')) {
    return {
      kind: 'CARD_DECLINED',
      retryClass: 'TERMINAL',
      ambiguous: false,
      countsAgainstBreaker: false,
      httpStatus: status || 402,
      gatewayCode: code
    };
  }

  // Default unknown
  return {
    kind: 'UNKNOWN',
    retryClass: 'TERMINAL',
    ambiguous: false,
    countsAgainstBreaker: false,
    httpStatus: status,
    gatewayCode: code
  };
}
