import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Router } from '../../modules/routing/router.js';
import { CircuitBreaker } from '../../modules/circuit-breaker/circuitBreaker.js';
import { HealthService } from '../../modules/health/healthService.js';
import { Transaction } from '@payroute/shared';

describe('T06 - Gateway Routing and Failover Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(HealthService, 'getWindowStats').mockResolvedValue({
      total: 10,
      successRate: 1.0,
      avgLatencyMs: 150,
      p95LatencyMs: 200,
      consecutiveFailures: 0,
    });
  });

  const baseTx: Transaction = {
    id: 'tx_01H8X700000000000000000001',
    clientId: 'usr_client_001',
    amount: 50000,
    currency: 'inr',
    status: 'CREATED',
    customer: { reference: 'cust_1' },
    paymentMethodType: 'test_token',
    routing: {
      preferredGateway: null,
      exhaustedGateways: [],
      currentGateway: null,
      gatewayGenerations: { stripe: 1, razorpay: 1 },
    },
    attemptCount: 0,
    retryCount: 0,
    flags: [],
    timeline: [],
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('selects primary gateway (stripe) when healthy and eligible', async () => {
    vi.spyOn(CircuitBreaker, 'peek').mockImplementation(async (gw) => ({
      state: 'CLOSED',
      enabled: true,
      canProbe: false,
    }));

    const decision = await Router.select(baseTx);
    expect(decision.selected).toBe('stripe');
    expect(decision.reason).toBe('PRIMARY');
  });

  it('falls back to razorpay when stripe is exhausted', async () => {
    vi.spyOn(CircuitBreaker, 'peek').mockImplementation(async (gw) => ({
      state: 'CLOSED',
      enabled: true,
      canProbe: false,
    }));

    const exhaustedTx: Transaction = {
      ...baseTx,
      routing: {
        ...baseTx.routing,
        exhaustedGateways: ['stripe'],
      },
    };

    const decision = await Router.select(exhaustedTx);
    expect(decision.selected).toBe('razorpay');
    expect(decision.reason).toBe('FALLBACK_AFTER_EXHAUSTION');
  });

  it('skips razorpay for USD currency because razorpay only supports INR', async () => {
    vi.spyOn(CircuitBreaker, 'peek').mockImplementation(async (gw) => ({
      state: 'CLOSED',
      enabled: true,
      canProbe: false,
    }));

    const usdTx: Transaction = {
      ...baseTx,
      currency: 'usd',
      routing: {
        ...baseTx.routing,
        exhaustedGateways: ['stripe'],
      },
    };

    const decision = await Router.select(usdTx);
    expect(decision.selected).toBeNull();
    expect(decision.reason).toBe('NONE_AVAILABLE');

    const rzpConsidered = decision.considered.find((c) => c.gateway === 'razorpay');
    expect(rzpConsidered?.eligible).toBe(false);
    expect(rzpConsidered?.skippedReason).toBe('CURRENCY_UNSUPPORTED');
  });

  it('routes to fallback gateway when primary circuit is OPEN', async () => {
    vi.spyOn(CircuitBreaker, 'peek').mockImplementation(async (gw) => {
      if (gw === 'stripe') {
        return { state: 'OPEN', enabled: true, canProbe: false };
      }
      return { state: 'CLOSED', enabled: true, canProbe: false };
    });

    const decision = await Router.select(baseTx);
    expect(decision.selected).toBe('razorpay');
    expect(decision.reason).toBe('CIRCUIT_FALLBACK');
  });
});
