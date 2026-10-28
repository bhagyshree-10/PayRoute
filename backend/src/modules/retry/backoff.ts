import { env } from '../../config/env.js';

export function calculateBackoffDelay(n: number, retryAfterMs?: number): number {
  const initialDelay = env.RETRY_INITIAL_DELAY_MS;
  const maxBackoff = 30000; // Constant in code (MAX_BACKOFF_MS)

  // Formula: min(RETRY_INITIAL_DELAY_MS * 2^(n-1), 30000) * random(0.8, 1.2)
  const baseExponential = Math.min(initialDelay * Math.pow(2, n - 1), maxBackoff);
  const jitter = 0.8 + Math.random() * 0.4; // 20% jitter
  let calculatedDelay = Math.round(baseExponential * jitter);

  if (retryAfterMs && retryAfterMs > 0) {
    calculatedDelay = Math.max(calculatedDelay, retryAfterMs);
  }

  return calculatedDelay;
}
