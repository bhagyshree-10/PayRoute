import { collections } from '../../infra/mongo.js';
import { GatewayName, HealthStatus } from '@payroute/shared';
import { deriveStatus, Window5mStats } from './deriveStatus.js';

export class HealthServiceClass {
  async getWindowStats(gwName: GatewayName): Promise<Window5mStats> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const attempts = await collections
      .paymentAttempts()
      .find({
        gateway: gwName,
        startedAt: { $gte: fiveMinutesAgo }
      })
      .sort({ startedAt: -1 })
      .limit(500)
      .toArray();

    if (attempts.length === 0) {
      const gwHealth = await collections.gatewayHealth().findOne({ _id: gwName as any });
      return {
        total: 0,
        successRate: null,
        avgLatencyMs: null,
        p95LatencyMs: null,
        consecutiveFailures: gwHealth?.consecutiveFailures || 0
      };
    }

    const total = attempts.length;
    const successes = attempts.filter(
      (a: any) => a.status === 'SUCCEEDED' || a.status === 'ACCEPTED'
    ).length;

    const successRate = total > 0 ? successes / total : null;

    const latencies = attempts
      .map((a: any) => a.latencyMs)
      .filter((l: any): l is number => typeof l === 'number')
      .sort((a: number, b: number) => a - b);

    const avgLatencyMs =
      latencies.length > 0
        ? Math.round(latencies.reduce((sum: number, val: number) => sum + val, 0) / latencies.length)
        : null;

    const p95Idx = latencies.length > 0 ? Math.floor(latencies.length * 0.95) : 0;
    const p95LatencyMs = latencies.length > 0 ? latencies[Math.min(p95Idx, latencies.length - 1)] : null;

    const gwHealth = await collections.gatewayHealth().findOne({ _id: gwName as any });

    return {
      total,
      successRate,
      avgLatencyMs,
      p95LatencyMs,
      consecutiveFailures: gwHealth?.consecutiveFailures || 0
    };
  }

  deriveStatusFromStats(circuitState: any, stats: Window5mStats, canProbe: boolean = false): HealthStatus {
    return deriveStatus(circuitState, stats, canProbe);
  }
}

export const HealthService = new HealthServiceClass();
