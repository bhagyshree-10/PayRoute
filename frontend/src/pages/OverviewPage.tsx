import React, { useState } from 'react';
import { useOverview } from '../api/hooks.js';
import { KpiStrip } from '../components/domain/KpiStrip.js';
import { GatewayStatusBadge } from '../components/domain/GatewayStatusBadge.js';
import { CircuitStateIndicator } from '../components/domain/CircuitStateIndicator.js';
import { AttemptsChart } from '../components/domain/AttemptsChart.js';
import { QueueGauge } from '../components/domain/QueueGauge.js';
import { Card } from '../components/ui/Card.js';
import { Skeleton } from '../components/ui/Skeleton.js';
import { ErrorState } from '../components/ui/ErrorState.js';
import { CopyableId } from '../components/ui/CopyableId.js';
import { formatDate } from '../lib/format.js';
import { getGatewayCode } from '../lib/routeGlyph.js';
import { Activity, AlertTriangle, Radio } from 'lucide-react';
import { Link } from 'react-router-dom';

export const OverviewPage: React.FC = () => {
  const [range, setRange] = useState<'1h' | '24h' | '7d'>('24h');
  const { data, isLoading, isError, error, refetch } = useOverview(range);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <ErrorState
        code={(error as any)?.code || 'OVERVIEW_LOAD_ERROR'}
        message={(error as any)?.message || 'Failed to load overview analytics'}
        requestId={(error as any)?.requestId}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Header controls & Time Range Filter */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h2 className="text-lg font-bold text-primary-dark">System Overview</h2>
          <p className="text-xs text-text-secondary">
            Real-time payment routing metrics, gateway circuits, and queue health.
          </p>
        </div>

        <div className="flex items-center gap-1 bg-surface border border-border rounded p-0.5">
          {(['1h', '24h', '7d'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                range === r
                  ? 'bg-primary text-white font-semibold'
                  : 'text-text-secondary hover:text-text hover:bg-surface-muted'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Strip */}
      <KpiStrip kpis={data.kpis} />

      {/* Compact Gateway Status Row */}
      <Card title="Gateway Circuit & Health Summary" action={<Link to="/gateways" className="text-xs text-primary font-medium hover:underline flex items-center gap-1"><Radio className="w-3.5 h-3.5"/> Manage Gateways</Link>}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.gateways.map((gw) => (
            <div
              key={gw.name}
              className="p-3 bg-surface-muted/50 border border-border rounded flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-sm bg-surface px-2 py-1 rounded border border-border">
                  {getGatewayCode(gw.name)}
                </span>
                <div>
                  <div className="text-xs font-semibold text-text uppercase">{gw.name}</div>
                  <div className="text-[11px] text-text-secondary">
                    5m Success Rate: {gw.successRate5m != null ? `${(gw.successRate5m * 100).toFixed(1)}%` : 'No traffic'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <GatewayStatusBadge status={gw.status} />
                <CircuitStateIndicator state={gw.circuitState} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Charts & Queue Depth */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card title="Payment Attempts & Outcomes" className="lg:col-span-2">
          <AttemptsChart series={data.series} />
        </Card>

        <div className="space-y-4">
          <QueueGauge title="Payment Attempt Queue" counts={data.queues.payments} />
          <QueueGauge title="Webhook Processing Queue" counts={data.queues.webhooks} />
        </div>
      </div>

      {/* Recent Failures List */}
      <Card
        title="Recent Failed Payments"
        subtitle="Last 5 payment transactions that reached FAILED status."
      >
        {data.recentFailures.length === 0 ? (
          <div className="text-xs text-text-muted p-4 text-center">
            No recent payment failures recorded in this timeframe.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {data.recentFailures.map((f) => (
              <div key={f.id} className="py-2.5 flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-error flex-shrink-0" />
                  <Link to={`/transactions/${f.id}`} className="hover:underline">
                    <CopyableId id={f.id} />
                  </Link>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-1.5 py-0.5 bg-error-subtle text-error-text rounded font-bold">
                    {f.code}
                  </span>
                  <span className="text-text-secondary">{getGatewayCode(f.gateway)}</span>
                  <span className="text-text-muted text-[11px]">{formatDate(f.at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
