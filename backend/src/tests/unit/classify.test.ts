import { describe, it, expect } from 'vitest';
import { classify } from '../../modules/retry/classify.js';
import { GatewayError } from '../../modules/gateways/types.js';

describe('T11 - Error Classification Unit Tests', () => {
  it('classifies TIMEOUT error correctly', () => {
    const err = new GatewayError({
      kind: 'TIMEOUT',
      retryClass: 'RETRY',
      message: 'Gateway timeout',
      ambiguous: true,
      countsAgainstBreaker: true
    });

    const result = classify(err);
    expect(result.kind).toBe('TIMEOUT');
    expect(result.retryClass).toBe('RETRY');
    expect(result.ambiguous).toBe(true);
    expect(result.countsAgainstBreaker).toBe(true);
  });

  it('classifies SERVER_ERROR 503 correctly', () => {
    const err = { statusCode: 503, message: 'Service Unavailable' };
    const result = classify(err);

    expect(result.kind).toBe('SERVER_ERROR');
    expect(result.retryClass).toBe('RETRY');
    expect(result.ambiguous).toBe(false);
    expect(result.countsAgainstBreaker).toBe(true);
  });

  it('classifies AUTH 401 error as FALLBACK', () => {
    const err = { status: 401, message: 'Unauthorized API key' };
    const result = classify(err);

    expect(result.kind).toBe('AUTH');
    expect(result.retryClass).toBe('FALLBACK');
    expect(result.countsAgainstBreaker).toBe(true);
  });

  it('classifies CARD_DECLINED as TERMINAL (not retried, does not count against breaker)', () => {
    const err = { status: 400, code: 'card_declined', message: 'Insufficient funds' };
    const result = classify(err);

    expect(result.kind).toBe('CARD_DECLINED');
    expect(result.retryClass).toBe('TERMINAL');
    expect(result.countsAgainstBreaker).toBe(false);
  });

  it('classifies INVALID_REQUEST as TERMINAL', () => {
    const err = { status: 400, message: 'Invalid parameter amount' };
    const result = classify(err);

    expect(result.kind).toBe('INVALID_REQUEST');
    expect(result.retryClass).toBe('TERMINAL');
    expect(result.countsAgainstBreaker).toBe(false);
  });
});
