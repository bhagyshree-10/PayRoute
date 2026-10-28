import React from 'react';
import { useHealth } from '../api/hooks.js';
import { Card } from '../components/ui/Card.js';
import { Badge } from '../components/ui/Badge.js';
import { KeyValue } from '../components/ui/KeyValue.js';
import { QueueGauge } from '../components/domain/QueueGauge.js';
import { GatewayStatusBadge } from '../components/domain/GatewayStatusBadge.js';
import { CircuitStateIndicator } from '../components/domain/CircuitStateIndicator.js';
import { Skeleton } from '../components/ui/Skeleton.js';
import { ErrorState } from '../components/ui/ErrorState.js';
import { formatDate, formatTimeAgo } from '../lib/format.js';
import { getGatewayCode } from '../lib/routeGlyph.js';
import { Server, Database, Cpu, Activity, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

export const SystemHealthPage: React.FC = () => {
  const { data, isLoading, isError, error, refetch } = useHealth();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <ErrorState
        code={(error as any)?.code || 'HEALTH_LOAD_ERROR'}
        message={(error as any)?.message || 'Failed to load system health'}
        requestId={(error as any)?.requestId}
        onRetry={() => refetch()}
      />
    );
  }

  const getStatusBadge = (status: 'OK' | 'DEGRADED' | 'DOWN') => {
    if (status === 'OK') return <Badge variant="success" icon={<CheckCircle2 className="w-3 h-3" />}>OK</Badge>;
    if (status === 'DEGRADED') return <Badge variant="warning" icon={<AlertTriangle className="w-3 h-3" />}>DEGRADED</Badge>;
    return <Badge variant="error" icon={<XCircle className="w-3 h-3" />}>DOWN</Badge>;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="border-b border-border pb-3">
        <h2 className="text-lg font-bold text-primary-dark">System Infrastructure Health</h2>
        <p className="text-xs text-text-secondary">
          Live process status, database latency, BullMQ background worker heartbeats, and maintenance sweepers.
        </p>
      </div>

      {/* Component Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-primary-dark">Express API</span>
            </div>
            {getStatusBadge(data.api.status)}
          </div>
          <div className="space-y-2">
            <KeyValue label="Version" value={data.api.version} mono />
            <KeyValue label="Node.js" value={data.api.nodeVersion} mono />
            <KeyValue label="Uptime" value={`${Math.floor(data.api.uptimeSeconds / 3600)}h ${Math.floor((data.api.uptimeSeconds % 3600) / 60)}m`} mono />
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-primary-dark">MongoDB</span>
            </div>
            {getStatusBadge(data.mongo.status)}
          </div>
          <div className="space-y-2">
            <KeyValue label="Role" value="System of Record" />
            <KeyValue label="Ping Latency" value={`${data.mongo.pingMs} ms`} mono />
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-primary-dark">Redis</span>
            </div>
            {getStatusBadge(data.redis.status)}
          </div>
          <div className="space-y-2">
            <KeyValue label="Role" value="Ephemeral Queue & Rate Limit" />
            <KeyValue label="Ping Latency" value={`${data.redis.pingMs} ms`} mono />
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-primary-dark">Worker Consumer</span>
            </div>
            {getStatusBadge(data.worker.status)}
          </div>
          <div className="space-y-2">
            <KeyValue label="Heartbeat Age" value={formatTimeAgo(data.worker.lastHeartbeatAt)} mono />
            <KeyValue label="Last Heartbeat" value={formatDate(data.worker.lastHeartbeatAt)} mono />
          </div>
        </Card>
      </div>

      {/* Queue Depths Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <QueueGauge title="Payment Processing Queue" counts={data.queues.payments} />
        <QueueGauge title="Webhook Intake & Processing Queue" counts={data.queues.webhooks} />
      </div>

      {/* Maintenance Sweeper Card */}
      <Card title="Maintenance Sweeper & Reconciliation" subtitle="Runs every 30s to repair stuck creations, unprocessed webhooks, and reconcile pending payments.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          <KeyValue label="Last Sweeper Run" value={formatDate(data.sweeper.lastRunAt)} mono />
          <KeyValue label="Run Duration" value={`${data.sweeper.lastRunDurationMs ?? 0} ms`} mono />
          <KeyValue label="Repairs Executed (Last Run)" value={(data.sweeper.repairsLastRun ?? 0).toString()} mono />
        </div>
      </Card>

      {/* Gateway Summary Card */}
      <Card title="Payment Gateway Readiness Summary">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data.gateways.map((gw) => (
            <div key={gw.name} className="p-3 bg-surface-muted/50 border border-border rounded flex items-center justify-between">
              <div className="flex items-center gap-2 font-mono text-xs font-bold">
                <span className="bg-surface px-2 py-1 rounded border border-border">{getGatewayCode(gw.name)}</span>
                <span className="text-text uppercase">{gw.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <GatewayStatusBadge status={gw.status} />
                <CircuitStateIndicator state={gw.circuitState} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
