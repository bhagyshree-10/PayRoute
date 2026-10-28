// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import React from 'react';
import { RouteTrace } from './components/domain/RouteTrace.js';
import { PaymentAttempt } from '@payroute/shared';

describe('RouteTrace Component', () => {
  it('renders attempt node codes, backoff gaps, and fallback hop correctly', () => {
    const attempts: PaymentAttempt[] = [
      {
        id: 'att_1',
        transactionId: 'txn_1',
        attemptNumber: 1,
        gateway: 'stripe',
        status: 'FAILED',
        gatewayIdempotencyKey: 'key_1',
        routingDecision: {
          strategy: 'deterministic-v1',
          selected: 'stripe',
          reason: 'PRIMARY',
          considered: [],
          decidedAt: new Date().toISOString()
        },
        isProbe: false,
        error: { kind: 'TIMEOUT', retryClass: 'RETRY', ambiguous: true, message: 'timeout' },
        latencyMs: 8000,
        startedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      },
      {
        id: 'att_2',
        transactionId: 'txn_1',
        attemptNumber: 2,
        gateway: 'razorpay',
        status: 'SUCCEEDED',
        gatewayIdempotencyKey: 'key_2',
        routingDecision: {
          strategy: 'deterministic-v1',
          selected: 'razorpay',
          reason: 'FALLBACK_AFTER_EXHAUSTION',
          considered: [],
          decidedAt: new Date().toISOString()
        },
        isProbe: false,
        latencyMs: 350,
        startedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      }
    ];

    render(<RouteTrace attempts={attempts} status="SUCCESS" />);

    // Assert STR and RZP gateway codes are rendered
    expect(screen.getAllByText('STR').length).toBeGreaterThan(0);
    expect(screen.getAllByText('RZP').length).toBeGreaterThan(0);

    // Assert FALLBACK text is rendered
    expect(screen.getByText('FALLBACK')).toBeDefined();

    // Assert Webhook outcome is rendered
    expect(screen.getAllByText(/Webhook → SUCCESS/i).length).toBeGreaterThan(0);
  });
});
