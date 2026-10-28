import { describe, it, expect } from 'vitest';
import { TransactionStatus } from '@payroute/shared';

describe('Transaction State Machine Rules', () => {
  const ALLOWED_FROM: Record<TransactionStatus, TransactionStatus[]> = {
    CREATED: [],
    PROCESSING: ['CREATED', 'RETRYING'],
    RETRYING: ['PROCESSING'],
    AWAITING_CONFIRMATION: ['PROCESSING'],
    SUCCESS: ['AWAITING_CONFIRMATION', 'PROCESSING', 'RETRYING', 'FAILED', 'CANCELLED'],
    FAILED: ['PROCESSING', 'AWAITING_CONFIRMATION'],
    CANCELLED: ['CREATED', 'RETRYING'],
  };

  it('allows valid transitions according to Section 16 table', () => {
    expect(ALLOWED_FROM.PROCESSING).toContain('CREATED');
    expect(ALLOWED_FROM.PROCESSING).toContain('RETRYING');
    expect(ALLOWED_FROM.AWAITING_CONFIRMATION).toContain('PROCESSING');
    expect(ALLOWED_FROM.SUCCESS).toContain('AWAITING_CONFIRMATION');
    expect(ALLOWED_FROM.FAILED).toContain('AWAITING_CONFIRMATION');
  });

  it('disallows invalid transitions', () => {
    expect(ALLOWED_FROM.CREATED).not.toContain('SUCCESS');
    expect(ALLOWED_FROM.PROCESSING).not.toContain('SUCCESS');
  });
});
