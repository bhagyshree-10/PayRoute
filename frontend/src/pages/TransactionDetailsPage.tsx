import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTransaction } from '../api/hooks.js';
import { TransactionStatusBadge } from '../components/domain/TransactionStatusBadge.js';
import { RouteTrace } from '../components/domain/RouteTrace.js';
import { AttemptTable } from '../components/domain/AttemptTable.js';
import { Card } from '../components/ui/Card.js';
import { Badge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/Button.js';
import { Skeleton } from '../components/ui/Skeleton.js';
import { ErrorState } from '../components/ui/ErrorState.js';
import { CopyableId } from '../components/ui/CopyableId.js';
import { KeyValue } from '../components/ui/KeyValue.js';
import { formatDate, formatMoney } from '../lib/format.js';
import { ArrowLeft, Code, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { cn } from '../lib/cn.js';

export const TransactionDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch } = useTransaction(id || '');

  const [showRawJson, setShowRawJson] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-4">
        <Link to="/transactions" className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Transactions
        </Link>
        <ErrorState
          code={(error as any)?.code || 'TRANSACTION_NOT_FOUND'}
          message={(error as any)?.message || 'Transaction details could not be found.'}
          requestId={(error as any)?.requestId}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const { transaction, attempts = [], webhookEvents = [], retryJobs = [] } = data;

  return (
    <div className="space-y-5">
      {/* Navigation & Actions Header */}
      <div className="flex items-center justify-between">
        <Link to="/transactions" className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Transactions
        </Link>

        <Button
          variant="secondary"
          size="sm"
          icon={<Code className="w-3.5 h-3.5" />}
          onClick={() => setShowRawJson(!showRawJson)}
        >
          {showRawJson ? 'Hide Raw JSON' : 'Raw JSON'}
        </Button>
      </div>

      {/* Main Header Details */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-mono font-bold text-primary-dark">
                <CopyableId id={transaction.id} truncate={false} />
              </h2>
              <TransactionStatusBadge status={transaction.status} />
            </div>
            <p className="text-xs text-text-secondary">
              Created on {formatDate(transaction.createdAt)} • Customer: <span className="font-mono">{transaction.customer?.reference}</span>
            </p>
          </div>

          <div className="text-left md:text-right">
            <div className="text-2xl font-bold font-mono text-primary-dark tabular-nums">
              {formatMoney(transaction.amount, transaction.currency)}
            </div>
            <div className="text-xs text-text-secondary uppercase font-mono">
              {transaction.currency}
            </div>
          </div>
        </div>

        {/* Transaction Flags */}
        {transaction.flags && transaction.flags.length > 0 && (
          <div className="pt-3 flex items-center gap-2">
            <span className="text-xs text-text-secondary font-medium">Audit Flags:</span>
            {transaction.flags.map((flag) => (
              <Badge key={flag} variant="warning" icon={<AlertTriangle className="w-3 h-3" />}>
                {flag}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      {/* Signature Component: Route Trace */}
      <Card
        title="Execution Route Trace"
        subtitle="Visual path of payment attempts, backoff delays, gateway failovers, and final webhook confirmation."
      >
        <RouteTrace attempts={attempts} status={transaction.status} retryJobs={retryJobs} />
      </Card>

      {/* Expandable Attempts Table */}
      <Card
        title="Payment Attempt History"
        subtitle="Expand any attempt row to inspect gateway selection, health checks, and decision rationale."
      >
        <AttemptTable attempts={attempts} />
      </Card>

      {/* Timeline & Webhooks / Retries Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Timeline Events */}
        <Card title="Audit Timeline" subtitle="Guarded state transitions and event log (newest first).">
          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {transaction.timeline.map((event, idx) => (
              <div key={idx} className="p-2.5 bg-surface-muted/50 border border-border rounded text-xs font-mono space-y-1">
                <div className="flex items-center justify-between text-text-secondary">
                  <span className="font-bold text-primary-dark">{event.type}</span>
                  <span className="text-[11px]">{formatDate(event.at)}</span>
                </div>
                {event.detail && Object.keys(event.detail).length > 0 && (
                  <div className="text-[11px] text-text-secondary bg-surface p-1.5 rounded border border-border/60">
                    {JSON.stringify(event.detail)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Linked Webhook Events & Retry Jobs */}
        <div className="space-y-4">
          <Card title="Linked Webhook Deliveries">
            {webhookEvents.length === 0 ? (
              <div className="text-xs text-text-muted p-2">No linked webhooks received.</div>
            ) : (
              <div className="space-y-2">
                {webhookEvents.map((w) => (
                  <div key={w.id} className="p-2.5 bg-surface border border-border rounded text-xs font-mono flex items-center justify-between">
                    <div>
                      <span className="font-bold text-text">{w.eventType}</span>
                      <div className="text-[11px] text-text-secondary">
                        ID: <CopyableId id={w.eventId} />
                      </div>
                    </div>
                    <Badge variant={w.status === 'PROCESSED' ? 'success' : 'neutral'}>
                      {w.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Scheduled & Executed Retries">
            {retryJobs.length === 0 ? (
              <div className="text-xs text-text-muted p-2">No retry jobs logged for this payment.</div>
            ) : (
              <div className="space-y-2">
                {retryJobs.map((rj) => (
                  <div key={rj.id} className="p-2.5 bg-surface border border-border rounded text-xs font-mono flex items-center justify-between">
                    <div>
                      <span className="font-bold text-text">{rj.type}</span> (Attempt #{rj.attemptNumber})
                      <div className="text-[11px] text-text-secondary">Reason: {rj.reason}</div>
                    </div>
                    <Badge variant={rj.status === 'COMPLETED' ? 'success' : 'warning'}>
                      {rj.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Raw JSON View */}
      {showRawJson && (
        <Card title="Raw Transaction JSON">
          <pre className="p-3 bg-surface-muted text-text font-mono text-xs rounded border border-border overflow-x-auto max-h-96">
            {JSON.stringify(data, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  );
};
