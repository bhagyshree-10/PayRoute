import { describe, it, expect } from 'vitest';
import { canonicalJson, computeRequestHash } from '../../modules/idempotency/hash.js';
import { containsSensitiveCardData } from '@payroute/shared';

describe('Idempotency Hashing & Sensitive Data Guard Unit Tests', () => {
  it('produces identical hash regardless of key insertion order in body', () => {
    const body1 = { amount: 49900, currency: 'inr', customer: { reference: 'cust_123' } };
    const body2 = { customer: { reference: 'cust_123' }, currency: 'inr', amount: 49900 };

    const hash1 = computeRequestHash(body1);
    const hash2 = computeRequestHash(body2);

    expect(hash1).toBe(hash2);
  });

  it('T03 - detects card numbers in request body', () => {
    expect(containsSensitiveCardData({ number: '4111111111111111' })).toBe(true);
    expect(containsSensitiveCardData({ pan: '1234567812345678' })).toBe(true);
    expect(containsSensitiveCardData({ cvv: '123' })).toBe(true);
    expect(containsSensitiveCardData('4111-1111-1111-1111')).toBe(true);

    expect(containsSensitiveCardData({ amount: 49900, currency: 'inr' })).toBe(false);
  });
});
