import { useGateways, useResetCircuit, useToggleGateway } from '../api/hooks.js';
import { useToast } from '../components/ui/Toast.js';
import { GatewayStatusBadge } from '../components/domain/GatewayStatusBadge.js';
import { CircuitStateIndicator } from '../components/domain/CircuitStateIndicator.js';
import { HeartbeatStrip } from '../components/domain/HeartbeatStrip.js';
import { SimulationPanel } from '../components/domain/SimulationPanel.js';
import { Card } from '../components/ui/Card.js';
import { Button } from '../components/ui/Button.js';
import { KeyValue } from '../components/ui/KeyValue.js';
import { Skeleton } from '../components/ui/Skeleton.js';
import { ErrorState } from '../components/ui/ErrorState.js';
import { formatDate, formatLatency } from '../lib/format.js';
import { getGatewayCode } from '../lib/routeGlyph.js';
import { Radio, RotateCcw, Power } from 'lucide-react';
import { GatewayName } from '@payroute/shared';

export const GatewaysPage: React.FC = () => {
  const { toast } = useToast();
  const { data: gateways = [], isLoading, isError, error, refetch } = useGateways();
  const toggleMutation = useToggleGateway();
  const resetCircuitMutation = useResetCircuit();

  const handleToggle = async (name: GatewayName, currentEnabled: boolean) => {
    try {
      await toggleMutation.mutateAsync({ name, enabled: !currentEnabled });
      toast('info', `${getGatewayCode(name)} ${!currentEnabled ? 'Enabled' : 'Disabled'}`);
    } catch (err: any) {
      toast('error', 'Failed to toggle gateway', err.message, err.requestId);
    }
  };

  const handleResetCircuit = async (name: GatewayName) => {
    try {
      await resetCircuitMutation.mutateAsync(name);
      toast('success', `Circuit for ${getGatewayCode(name)} reset to CLOSED`);
    } catch (err: any) {
      toast('error', 'Failed to reset circuit', err.message, err.requestId);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        code={(error as any)?.code || 'GATEWAYS_LOAD_ERROR'}
        message={(error as any)?.message || 'Failed to load gateway status'}
        requestId={(error as any)?.requestId}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="border-b border-border pb-3">
        <h2 className="text-lg font-bold text-primary-dark">Payment Gateways</h2>
        <p className="text-xs text-text-secondary">
          Monitor gateway availability, 5-minute window health metrics, circuit states, and manual controls.
        </p>
      </div>

      {/* Gateway Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {gateways.map((gw) => {
          const code = getGatewayCode(gw.name);
          const successPct = gw.window5m.successRate != null ? `${(gw.window5m.successRate * 100).toFixed(1)}%` : '-';

          return (
            <Card key={gw.name} className="p-4 space-y-4">
              {/* Card Header */}
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-base bg-surface-muted px-2.5 py-1 rounded border border-border">
                    {code}
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-primary-dark uppercase">{gw.name} Test Mode</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <GatewayStatusBadge status={gw.status} />
                      <CircuitStateIndicator state={gw.circuitState} showDiagram />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant={gw.enabled ? 'secondary' : 'primary'}
                    size="sm"
                    icon={<Power className="w-3.5 h-3.5" />}
                    onClick={() => handleToggle(gw.name, gw.enabled)}
                    isLoading={toggleMutation.isPending}
                  >
                    {gw.enabled ? 'Disable' : 'Enable'}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<RotateCcw className="w-3.5 h-3.5" />}
                    onClick={() => handleResetCircuit(gw.name)}
                    isLoading={resetCircuitMutation.isPending}
                  >
                    Reset Circuit
                  </Button>
                </div>
              </div>

              {/* 5-Minute Window Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-surface-muted/50 rounded border border-border">
                <KeyValue label="5m Success Rate" value={successPct} mono />
                <KeyValue label="Avg Latency" value={formatLatency(gw.window5m.avgLatencyMs)} mono />
                <KeyValue label="p95 Latency" value={formatLatency(gw.window5m.p95LatencyMs)} mono />
                <KeyValue label="Consec. Faults" value={gw.consecutiveFailures.toString()} mono />
              </div>

              {/* Success / Failure Audits */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-text-secondary">Last Success: </span>
                  <span className="font-mono font-medium">{formatDate(gw.lastSuccessAt)}</span>
                </div>
                <div>
                  <span className="text-text-secondary">Last Failure: </span>
                  <span className="font-mono font-medium text-error">
                    {formatDate(gw.lastFailureAt)} {gw.lastFailureReason ? `(${gw.lastFailureReason})` : ''}
                  </span>
                </div>
              </div>

              {/* 60m Activity Heartbeat Strip */}
              <HeartbeatStrip activity={gw.activity60m} />

              {/* Recent Circuit Transitions */}
              {gw.recentTransitions && gw.recentTransitions.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-border">
                  <span className="text-[11px] font-semibold text-text-secondary uppercase">Recent Transitions:</span>
                  <div className="space-y-1 max-h-24 overflow-y-auto text-[11px] font-mono">
                    {gw.recentTransitions.map((t, idx) => (
                      <div key={idx} className="flex items-center justify-between text-text-secondary">
                        <span>{t.from} → {t.to} ({t.reason})</span>
                        <span>{formatDate(t.at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Failure Injection Demo Controls */}
      <SimulationPanel />
    </div>
  );
};
