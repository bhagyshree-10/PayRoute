import { CircuitState, HealthStatus } from '@payroute/shared';

export interface Window5mStats {
  total: number;
  successRate: number | null;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  consecutiveFailures?: number;
}

export function deriveStatus(
  circuitState: CircuitState,
  window5m: Window5mStats,
  canProbe: boolean = false
): HealthStatus {
  if (circuitState === 'OPEN' && !canProbe) {
    return 'DOWN';
  }

  if (circuitState === 'HALF_OPEN' || (circuitState === 'OPEN' && canProbe)) {
    return 'RECOVERING';
  }

  if (window5m.total >= 10 && window5m.successRate !== null && window5m.successRate < 0.95) {
    return 'DEGRADED';
  }

  if (window5m.avgLatencyMs !== null && window5m.avgLatencyMs > 3000) {
    return 'DEGRADED';
  }

  if (window5m.consecutiveFailures !== undefined && window5m.consecutiveFailures >= 2) {
    return 'DEGRADED';
  }

  return 'HEALTHY';
}
