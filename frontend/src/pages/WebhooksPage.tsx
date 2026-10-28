import React, { useState } from 'react';
import { useWebhooks } from '../api/hooks.js';
import { WebhookEvent } from '@payroute/shared';
import { WebhookDrawer } from '../components/domain/WebhookDrawer.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table.js';
import { Badge } from '../components/ui/Badge.js';
import { Select } from '../components/ui/Select.js';
import { Skeleton } from '../components/ui/Skeleton.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { ErrorState } from '../components/ui/ErrorState.js';
import { CopyableId } from '../components/ui/CopyableId.js';
import { formatDate } from '../lib/format.js';
import { getGatewayCode } from '../lib/routeGlyph.js';
import { Webhook, Check, X, Inbox, RotateCcw } from 'lucide-react';

export const WebhooksPage: React.FC = () => {
  const [status, setStatus] = useState('');
  const [gateway, setGateway] = useState('');
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookEvent | null>(null);

  const queryParams: Record<string, string> = {};
  if (status) queryParams.status = status;
  if (gateway) queryParams.gateway = gateway;

  const { data, isLoading, isError, error, refetch } = useWebhooks(queryParams);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="border-b border-border pb-3">
        <h2 className="text-lg font-bold text-primary-dark">Webhook Audit Ledger</h2>
        <p className="text-xs text-text-secondary">
          Durable, signature-verified gateway event logs and duplicate absorption tracking.
        </p>
      </div>

      {/* Filter Bar */}
      <div className="p-3 bg-surface border border-border rounded-md flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: '', label: 'All Event Statuses' },
              { value: 'PROCESSED', label: 'PROCESSED' },
              { value: 'RECEIVED', label: 'RECEIVED' },
              { value: 'IGNORED', label: 'IGNORED' },
              { value: 'FAILED', label: 'FAILED' },
              { value: 'ORPHANED', label: 'ORPHANED' },
            ]}
          />

          <Select
            value={gateway}
            onChange={(e) => setGateway(e.target.value)}
            options={[
              { value: '', label: 'All Gateways' },
              { value: 'stripe', label: 'Stripe' },
              { value: 'razorpay', label: 'Razorpay' },
            ]}
          />
        </div>

        <div className="text-xs text-text-secondary font-mono">
          Click any row to inspect payload snapshot
        </div>
      </div>

      {/* Table & Content */}
      {isLoading ? (
        <Skeleton rows={6} />
      ) : isError ? (
        <ErrorState
          code={(error as any)?.code || 'WEBHOOKS_LOAD_ERROR'}
          message={(error as any)?.message || 'Failed to load webhooks list'}
          requestId={(error as any)?.requestId}
          onRetry={() => refetch()}
        />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={Webhook}
          title="No webhook events found"
          description="No gateway webhooks match the selected filters."
        />
      ) : (
        <Table caption="Webhook Log Ledger">
          <TableHeader>
            <TableRow>
              <TableHead>Gateway</TableHead>
              <TableHead>Event Type</TableHead>
              <TableHead>Event ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Duplicates</TableHead>
              <TableHead className="text-center">Attempts</TableHead>
              <TableHead>Received At</TableHead>
              <TableHead>Processed At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((ev) => (
              <TableRow
                key={ev.id}
                className="cursor-pointer hover:bg-surface-muted/80"
                onClick={() => setSelectedWebhook(ev)}
              >
                <TableCell>
                  <span className="font-mono font-bold text-text-secondary bg-surface-muted px-1.5 py-0.5 rounded border border-border">
                    {getGatewayCode(ev.gateway)}
                  </span>
                </TableCell>
                <TableCell className="font-mono font-semibold text-text">{ev.eventType}</TableCell>
                <TableCell>
                  <CopyableId id={ev.eventId} />
                </TableCell>
                <TableCell>
                  {ev.status === 'PROCESSED' ? (
                    <Badge variant="success" icon={<Check className="w-3 h-3" />}>
                      PROCESSED
                    </Badge>
                  ) : ev.status === 'FAILED' || ev.status === 'ORPHANED' ? (
                    <Badge variant="error" icon={<X className="w-3 h-3" />}>
                      {ev.status}
                    </Badge>
                  ) : (
                    <Badge variant="neutral" icon={<Inbox className="w-3 h-3" />}>
                      {ev.status}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-center font-mono tabular-nums">
                  {ev.duplicateCount > 0 ? (
                    <span className="px-1.5 py-0.5 bg-success-subtle text-success-text rounded font-bold">
                      +{ev.duplicateCount}
                    </span>
                  ) : (
                    '0'
                  )}
                </TableCell>
                <TableCell className="text-center font-mono tabular-nums">
                  {ev.processingAttempts}
                </TableCell>
                <TableCell className="text-text-secondary text-[11px]">
                  {formatDate(ev.receivedAt)}
                </TableCell>
                <TableCell className="text-text-secondary text-[11px]">
                  {formatDate(ev.processedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Webhook Side Drawer */}
      <WebhookDrawer
        webhook={selectedWebhook}
        isOpen={Boolean(selectedWebhook)}
        onClose={() => setSelectedWebhook(null)}
      />
    </div>
  );
};
