import { collections } from '../../infra/mongo.js';
import { env } from '../../config/env.js';
import { logger } from '../../infra/logger.js';
import { GatewayName, CircuitState, ErrorKind, GatewayHealth } from '@payroute/shared';

export class CircuitBreakerClass {
  async recordSuccess(gw: GatewayName): Promise<void> {
    const now = new Date();
    const doc = await collections.gatewayHealth().findOneAndUpdate(
      { _id: gw as any },
      {
        $set: { consecutiveFailures: 0, lastSuccessAt: now },
        $inc: { successCount: 1 }
      },
      { returnDocument: 'before' }
    );

    if (doc && doc.state === 'HALF_OPEN') {
      await collections.gatewayHealth().updateOne(
        { _id: gw as any, state: 'HALF_OPEN' },
        {
          $set: { state: 'CLOSED', probeInFlight: false, stateChangedAt: now },
          $push: {
            recentTransitions: {
              $each: [{ from: 'HALF_OPEN', to: 'CLOSED', at: now, reason: 'PROBE_OK' }],
              $slice: -20
            }
          }
        } as any
      );
      logger.info({ gateway: gw, event: 'circuit.closed' }, 'Circuit breaker closed after successful probe');
    }
  }

  async recordFailure(gw: GatewayName, errKind?: ErrorKind): Promise<void> {
    const now = new Date();
    const doc = await collections.gatewayHealth().findOneAndUpdate(
      { _id: gw as any },
      {
        $inc: { consecutiveFailures: 1, failureCount: 1 },
        $set: { lastFailureAt: now, lastFailureReason: errKind || 'UNKNOWN' }
      },
      { returnDocument: 'after' }
    );

    if (!doc) return;

    const threshold = env.CIRCUIT_BREAKER_THRESHOLD;
    const timeoutMs = env.CIRCUIT_BREAKER_TIMEOUT_MS;
    const nextProbeAt = new Date(now.getTime() + timeoutMs);

    if (doc.state === 'CLOSED' && doc.consecutiveFailures >= threshold) {
      const res = await collections.gatewayHealth().updateOne(
        { _id: gw as any, state: 'CLOSED' },
        {
          $set: {
            state: 'OPEN',
            openedAt: now,
            nextProbeAt,
            stateChangedAt: now
          },
          $push: {
            recentTransitions: {
              $each: [{ from: 'CLOSED', to: 'OPEN', at: now, reason: `FAILURES_THRESHOLD_${threshold}` }],
              $slice: -20
            }
          }
        } as any
      );
      if (res.modifiedCount > 0) {
        logger.warn({ gateway: gw, event: 'circuit.opened', consecutiveFailures: doc.consecutiveFailures }, 'Circuit breaker opened');
      }
    } else if (doc.state === 'HALF_OPEN') {
      await collections.gatewayHealth().updateOne(
        { _id: gw as any, state: 'HALF_OPEN' },
        {
          $set: {
            state: 'OPEN',
            openedAt: now,
            nextProbeAt,
            probeInFlight: false,
            stateChangedAt: now
          },
          $push: {
            recentTransitions: {
              $each: [{ from: 'HALF_OPEN', to: 'OPEN', at: now, reason: 'PROBE_FAILED' }],
              $slice: -20
            }
          }
        } as any
      );
      logger.warn({ gateway: gw, event: 'circuit.reopened' }, 'Circuit breaker reopened after failed probe');
    }
  }

  async acquire(gw: GatewayName): Promise<{ allowed: boolean; isProbe: boolean; reason?: string }> {
    const doc = await collections.gatewayHealth().findOne({ _id: gw as any });
    if (!doc) return { allowed: false, isProbe: false, reason: 'NOT_FOUND' };

    if (!doc.enabled) {
      return { allowed: false, isProbe: false, reason: 'DISABLED' };
    }

    if (doc.state === 'CLOSED') {
      return { allowed: true, isProbe: false };
    }

    const now = new Date();
    const probeTimeoutLimit = env.GATEWAY_TIMEOUT_MS * 2;

    if (doc.state === 'OPEN') {
      if (doc.nextProbeAt && now.getTime() >= new Date(doc.nextProbeAt).getTime()) {
        const res = await collections.gatewayHealth().findOneAndUpdate(
          { _id: gw as any, state: 'OPEN', nextProbeAt: { $lte: now } },
          {
            $set: {
              state: 'HALF_OPEN',
              probeInFlight: true,
              probeStartedAt: now,
              stateChangedAt: now
            },
            $push: {
              recentTransitions: {
                $each: [{ from: 'OPEN', to: 'HALF_OPEN', at: now, reason: 'PROBE_WINDOW_ELAPSED' }],
                $slice: -20
              }
            }
          } as any
        );

        if (res) {
          logger.info({ gateway: gw, event: 'circuit.half_open' }, 'Probe granted in HALF_OPEN state');
          return { allowed: true, isProbe: true };
        }
      }
      return { allowed: false, isProbe: false, reason: 'CIRCUIT_OPEN' };
    }

    if (doc.state === 'HALF_OPEN') {
      const probeStartedAtMs = doc.probeStartedAt ? new Date(doc.probeStartedAt).getTime() : 0;
      const isStaleProbe = !doc.probeInFlight || (now.getTime() - probeStartedAtMs > probeTimeoutLimit);

      if (isStaleProbe) {
        const res = await collections.gatewayHealth().findOneAndUpdate(
          { _id: gw as any, state: 'HALF_OPEN', probeStartedAt: doc.probeStartedAt },
          {
            $set: {
              probeInFlight: true,
              probeStartedAt: now
            }
          }
        );
        if (res) {
          return { allowed: true, isProbe: true };
        }
      }
      return { allowed: false, isProbe: false, reason: 'PROBE_BUSY' };
    }

    return { allowed: false, isProbe: false, reason: 'CIRCUIT_OPEN' };
  }

  async peek(gw: GatewayName): Promise<{ state: CircuitState; enabled: boolean; canProbe: boolean }> {
    const doc = await collections.gatewayHealth().findOne({ _id: gw as any });
    if (!doc) return { state: 'CLOSED', enabled: true, canProbe: false };

    const now = Date.now();
    const canProbe =
      doc.state === 'OPEN' && doc.nextProbeAt && now >= new Date(doc.nextProbeAt).getTime();

    return {
      state: doc.state,
      enabled: doc.enabled,
      canProbe: Boolean(canProbe)
    };
  }

  async resetCircuit(gw: GatewayName): Promise<void> {
    const now = new Date();
    await collections.gatewayHealth().updateOne(
      { _id: gw as any },
      {
        $set: {
          state: 'CLOSED',
          consecutiveFailures: 0,
          probeInFlight: false,
          stateChangedAt: now
        },
        $push: {
          recentTransitions: {
            $each: [{ from: 'OPEN', to: 'CLOSED', at: now, reason: 'MANUAL_RESET' }],
            $slice: -20
          }
        }
      } as any
    );
    logger.warn({ gateway: gw, event: 'circuit.reset' }, 'Circuit breaker manually reset to CLOSED');
  }
}

export const CircuitBreaker = new CircuitBreakerClass();
