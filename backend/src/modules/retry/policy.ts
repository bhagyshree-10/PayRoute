import { env } from '../../config/env.js';
import { GatewayName, PaymentAttempt, Transaction } from '@payroute/shared';
import { GatewayError } from '../gateways/types.js';
import { calculateBackoffDelay } from './backoff.js';
import { Router } from '../routing/router.js';

export type RetryPlan =
  | { type: 'RETRY_SAME'; delayMs: number; gateway: GatewayName }
  | { type: 'FALLBACK'; delayMs: 0; fallbackGateway?: GatewayName }
  | { type: 'FAIL'; failureCode: string; failureMessage: string };

export class RetryPolicyClass {
  async next(
    tx: Transaction,
    currentAttempt: PaymentAttempt,
    err: GatewayError
  ): Promise<RetryPlan> {
    if (err.retryClass === 'TERMINAL') {
      return {
        type: 'FAIL',
        failureCode: err.gatewayCode || err.kind || 'TERMINAL_ERROR',
        failureMessage: err.message || 'Terminal gateway error',
      };
    }

    const maxRetriesPerGateway = env.PAYMENT_MAX_RETRIES;
    const currentGateway = currentAttempt.gateway;

    // Calculate how many retries were already executed on this gateway for this transaction
    const attemptsOnGateway = currentAttempt.attemptNumber; // 1-based attempt count
    const gatewayGen = tx.routing?.gatewayGenerations?.[currentGateway] || 1;

    if (err.retryClass === 'RETRY' && gatewayGen <= maxRetriesPerGateway) {
      const delayMs = calculateBackoffDelay(gatewayGen, err.retryAfterMs);
      return {
        type: 'RETRY_SAME',
        delayMs,
        gateway: currentGateway,
      };
    }

    // Retries used up or error is FALLBACK class (e.g. AUTH) -> check fallback eligibility
    // Temporarily append current gateway to exhausted list to test router selection
    const mockTx: Transaction = {
      ...tx,
      routing: {
        ...tx.routing,
        exhaustedGateways: [...(tx.routing?.exhaustedGateways || []), currentGateway],
      },
    };

    const nextDecision = await Router.select(mockTx);

    if (nextDecision.selected && nextDecision.selected !== currentGateway) {
      return {
        type: 'FALLBACK',
        delayMs: 0,
        fallbackGateway: nextDecision.selected,
      };
    }

    return {
      type: 'FAIL',
      failureCode:
        err.retryClass === 'RETRY' ? 'RETRIES_EXHAUSTED' : 'NO_FALLBACK_AVAILABLE',
      failureMessage:
        err.retryClass === 'RETRY'
          ? `Retry budget exhausted on every eligible gateway (${currentGateway})`
          : `Primary gateway ${currentGateway} failed and no eligible fallback gateway is available`,
    };
  }
}

export const RetryPolicy = new RetryPolicyClass();
