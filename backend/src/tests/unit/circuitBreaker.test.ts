import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker } from '../../modules/circuit-breaker/circuitBreaker.js';
import { collections } from '../../infra/mongo.js';
import { env } from '../../config/env.js';

describe('T07 - Circuit Breaker State Transitions Unit Tests', () => {
  let mockDoc: any;
  let updateOneCalls: any[] = [];

  beforeEach(() => {
    updateOneCalls = [];
    mockDoc = {
      _id: 'stripe',
      state: 'CLOSED',
      consecutiveFailures: 0,
      enabled: true,
      successCount: 10,
      failureCount: 0,
      probeInFlight: false,
      nextProbeAt: null,
      recentTransitions: [],
    };

    vi.spyOn(collections, 'gatewayHealth').mockReturnValue({
      findOne: vi.fn(async () => mockDoc),
      findOneAndUpdate: vi.fn(async (query: any, update: any) => {
        if (update.$inc?.consecutiveFailures) {
          mockDoc.consecutiveFailures += update.$inc.consecutiveFailures;
        }
        if (update.$inc?.failureCount) {
          mockDoc.failureCount += update.$inc.failureCount;
        }
        if (update.$set?.consecutiveFailures !== undefined) {
          mockDoc.consecutiveFailures = update.$set.consecutiveFailures;
        }
        return mockDoc;
      }),
      updateOne: vi.fn(async (query: any, update: any) => {
        updateOneCalls.push({ query, update });
        if (update.$set?.state) {
          mockDoc.state = update.$set.state;
        }
        return { modifiedCount: 1 };
      }),
    } as any);
  });

  it('allows requests when state is CLOSED', async () => {
    const permit = await CircuitBreaker.acquire('stripe');
    expect(permit.allowed).toBe(true);
    expect(permit.isProbe).toBe(false);
  });

  it('transitions from CLOSED to OPEN when consecutive failures reach threshold', async () => {
    mockDoc.state = 'CLOSED';
    mockDoc.consecutiveFailures = env.CIRCUIT_BREAKER_THRESHOLD - 1;

    // Trigger threshold failure
    await CircuitBreaker.recordFailure('stripe', 'TIMEOUT');

    expect(updateOneCalls.length).toBeGreaterThan(0);
    const openUpdate = updateOneCalls.find((c) => c.update.$set?.state === 'OPEN');
    expect(openUpdate).toBeDefined();
    expect(mockDoc.state).toBe('OPEN');
  });

  it('transitions from HALF_OPEN to CLOSED upon successful probe execution', async () => {
    mockDoc.state = 'HALF_OPEN';
    mockDoc.consecutiveFailures = 5;

    await CircuitBreaker.recordSuccess('stripe');

    expect(updateOneCalls.length).toBeGreaterThan(0);
    const closeUpdate = updateOneCalls.find((c) => c.update.$set?.state === 'CLOSED');
    expect(closeUpdate).toBeDefined();
    expect(mockDoc.state).toBe('CLOSED');
  });

  it('transitions from HALF_OPEN to OPEN upon failed probe execution', async () => {
    mockDoc.state = 'HALF_OPEN';

    await CircuitBreaker.recordFailure('stripe', 'SERVER_ERROR');

    const reopenUpdate = updateOneCalls.find((c) => c.update.$set?.state === 'OPEN');
    expect(reopenUpdate).toBeDefined();
  });
});
