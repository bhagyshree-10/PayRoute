import {
  GatewayName,
  RoutingDecision,
  RoutingDecisionConsidered,
  RoutingReason,
  Transaction
} from '@payroute/shared';
import { GatewayRegistry } from '../gateways/registry.js';
import { CircuitBreaker } from '../circuit-breaker/circuitBreaker.js';
import { env } from '../../config/env.js';
import { HealthService } from '../health/healthService.js';

export class RouterClass {
  async select(tx: Transaction): Promise<RoutingDecision> {
    const now = new Date();
    const allGateways = GatewayRegistry.getAllGateways();

    const preferredOrPrimary: GatewayName =
      tx.routing?.preferredGateway || (env.PRIMARY_GATEWAY as GatewayName) || 'stripe';

    const gatewayPriorityOrder: GatewayName[] = [
      preferredOrPrimary,
      ...allGateways.map((g) => g.name).filter((g) => g !== preferredOrPrimary),
    ];

    const considered: RoutingDecisionConsidered[] = [];

    for (const gwName of gatewayPriorityOrder) {
      const gw = allGateways.find((g) => g.name === gwName);
      const isCurrencyEligible = Boolean(gw && gw.supportedCurrencies.includes(tx.currency.toLowerCase()));

      const peekState = await CircuitBreaker.peek(gwName);
      const windowStats = await HealthService.getWindowStats(gwName);
      const healthStatus = HealthService.deriveStatusFromStats(peekState.state, windowStats, peekState.canProbe);

      const isExhausted = tx.routing?.exhaustedGateways?.includes(gwName) ?? false;
      const isEligible = peekState.enabled && isCurrencyEligible;

      let skippedReason: RoutingDecisionConsidered['skippedReason'];

      if (!isCurrencyEligible) {
        skippedReason = 'CURRENCY_UNSUPPORTED';
      } else if (!peekState.enabled) {
        skippedReason = 'DISABLED';
      } else if (isExhausted) {
        skippedReason = 'EXHAUSTED';
      } else if (peekState.state === 'OPEN' && !peekState.canProbe) {
        skippedReason = 'CIRCUIT_OPEN';
      }

      considered.push({
        gateway: gwName,
        eligible: isEligible && !isExhausted && (peekState.state !== 'OPEN' || peekState.canProbe),
        circuitState: peekState.state,
        healthStatus,
        skippedReason,
      });
    }

    // Filter candidate list
    const candidateEntries = considered.filter((c) => c.eligible);

    if (candidateEntries.length === 0) {
      return {
        strategy: 'deterministic-v1',
        selected: null,
        reason: 'NONE_AVAILABLE',
        considered,
        decidedAt: now,
      };
    }

    const firstCandidate = candidateEntries[0];

    // Soft Health Preference Rule (Step 5)
    if (firstCandidate.healthStatus === 'DEGRADED' && candidateEntries.length > 1) {
      const healthyAlternative = candidateEntries.find((c) => c.healthStatus === 'HEALTHY');
      if (healthyAlternative) {
        return {
          strategy: 'deterministic-v1',
          selected: healthyAlternative.gateway,
          reason: 'HEALTH_PREFERENCE',
          considered,
          decidedAt: now,
        };
      }
    }

    // Determine reason
    let reason: RoutingReason = 'PRIMARY';

    if (tx.routing?.preferredGateway && firstCandidate.gateway === tx.routing.preferredGateway) {
      reason = 'PREFERRED';
    } else if (tx.routing?.exhaustedGateways && tx.routing.exhaustedGateways.length > 0) {
      reason = 'FALLBACK_AFTER_EXHAUSTION';
    } else if (firstCandidate.circuitState === 'HALF_OPEN') {
      reason = 'HALF_OPEN_PROBE';
    } else if (firstCandidate.gateway !== preferredOrPrimary) {
      reason = 'CIRCUIT_FALLBACK';
    }

    return {
      strategy: 'deterministic-v1',
      selected: firstCandidate.gateway,
      reason,
      considered,
      decidedAt: now,
    };
  }
}

export const Router = new RouterClass();
