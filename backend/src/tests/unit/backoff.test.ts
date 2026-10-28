import { describe, it, expect } from 'vitest';
import { calculateBackoffDelay } from '../../modules/retry/backoff.js';

describe('T05 - Backoff Delay and Jitter Unit Tests', () => {
  it('calculates exponential delay with 20% jitter within expected bounds', () => {
    // Attempt 1: base = 1000 * 2^0 = 1000, bounds [800, 1200]
    for (let i = 0; i < 20; i++) {
      const delay = calculateBackoffDelay(1);
      expect(delay).toBeGreaterThanOrEqual(790);
      expect(delay).toBeLessThanOrEqual(1210);
    }

    // Attempt 2: base = 1000 * 2^1 = 2000, bounds [1600, 2400]
    for (let i = 0; i < 20; i++) {
      const delay = calculateBackoffDelay(2);
      expect(delay).toBeGreaterThanOrEqual(1590);
      expect(delay).toBeLessThanOrEqual(2410);
    }

    // Attempt 3: base = 1000 * 2^2 = 4000, bounds [3200, 4800]
    for (let i = 0; i < 20; i++) {
      const delay = calculateBackoffDelay(3);
      expect(delay).toBeGreaterThanOrEqual(3190);
      expect(delay).toBeLessThanOrEqual(4810);
    }
  });

  it('honors retryAfterMs when provided by gateway rate-limit headers', () => {
    const delay = calculateBackoffDelay(1, 5000);
    expect(delay).toBeGreaterThanOrEqual(5000);
  });

  it('caps exponential backoff at MAX_BACKOFF_MS (30s) plus jitter', () => {
    const delay = calculateBackoffDelay(10);
    // 30000 * 1.2 = 36000 max
    expect(delay).toBeLessThanOrEqual(36500);
  });
});
