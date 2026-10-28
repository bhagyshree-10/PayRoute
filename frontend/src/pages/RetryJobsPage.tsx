import React, { useState } from 'react';
import { useRetryJobs } from '../api/hooks.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table.js';
import { Badge } from '../components/ui/Badge.js';
import { Select } from '../components/ui/Select.js';
import { Card } from '../components/ui/Card.js';
import { Skeleton } from '../components/ui/Skeleton.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { ErrorState } from '../components/ui/ErrorState.js';
import { CopyableId } from '../components/ui/CopyableId.js';
import { formatDate, formatTimeAgo } from '../lib/format.js';
import { getGatewayCode } from '../lib/routeGlyph.js';
import { RotateCcw, Clock, Check, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

export const RetryJobsPage: React.FC = () => {
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');

  const queryParams: Record<string, string> = {};
  if (status) queryParams.status = status;
  if (type) queryParams.type = type;

  const { data, isLoading, isError, error, refetch } = useRetryJobs(queryParams);

  const scheduledJobs = data?.items.filter((j) => j.status === 'SCHEDULED') || [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="border-b border-border pb-3">
        <h2 className="text-lg font-bold text-primary-dark">Retry & Fallback Jobs</h2>
        <p className="text-xs text-text-secondary">
          Audit history of scheduled retry delays, exponential backoffs, and routing waits.
        </p>
      </div>

      {/* Upcoming Countdown Strip */}
      {scheduledJobs.length > 0 && (
        <Card className="p-3 bg-warning-subtle/50 border-warning/40">
          <div className="flex items-center justify-between text-xs text-warning-text font-mono">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-warning animate-pulse" />
              <span className="font-bold">{scheduledJobs.length} Upcoming Delayed Retry Job(s) Pending</span>
            </div>
            <span>Next scheduled: {formatDate(scheduledJobs[0].scheduledFor)}</span>
          </div>
        </Card>
      )}

      {/* Filter Bar */}
      <div className="p-3 bg-surface border border-border rounded-md flex flex-col sm:flex-row items-center gap-3">
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: '', label: 'All Job Statuses' },
            { value: 'SCHEDULED', label: 'SCHEDULED' },
            { value: 'ACTIVE', label: 'ACTIVE' },
            { value: 'COMPLETED', label: 'COMPLETED' },
            { value: 'FAILED', label: 'FAILED' },
            { value: 'CANCELLED', label: 'CANCELLED' },
          ]}
        />

        <Select
          value={type}
          onChange={(e) => setType(e.target.value)}
          options={[
            { value: '', label: 'All Job Types' },
            { value: 'PAYMENT_RETRY', label: 'PAYMENT_RETRY' },
            { value: 'FALLBACK', label: 'FALLBACK' },
            { value: 'ROUTING_WAIT', label: 'ROUTING_WAIT' },
          ]}
        />
      </div>

      {/* Table & Content */}
      {isLoading ? (
        <Skeleton rows={6} />
      ) : isError ? (
        <ErrorState
          code={(error as any)?.code || 'RETRIES_LOAD_ERROR'}
          message={(error as any)?.message || 'Failed to load retry jobs'}
          requestId={(error as any)?.requestId}
          onRetry={() => refetch()}
        />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={RotateCcw}
          title="No retry jobs found"
          description="No retry or fallback jobs recorded matching the selected criteria."
        />
      ) : (
        <Table caption="Retry Job Registry">
          <TableHeader>
            <TableRow>
              <TableHead>BullMQ Job ID</TableHead>
              <TableHead>Transaction</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Attempt #</TableHead>
              <TableHead>Planned Gateway</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="text-right">Delay</TableHead>
              <TableHead>Scheduled For</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((job) => (
              <TableRow key={job.id}>
                <TableCell className="font-mono text-xs font-semibold">
                  <CopyableId id={job.queueJobId} />
                </TableCell>
                <TableCell>
                  <Link to={`/transactions/${job.transactionId}`} className="font-mono text-xs text-primary hover:underline">
                    <CopyableId id={job.transactionId} />
                  </Link>
                </TableCell>
                <TableCell className="font-mono font-bold text-xs">{job.type}</TableCell>
                <TableCell className="font-mono text-center">#{job.attemptNumber}</TableCell>
                <TableCell className="font-mono">
                  {job.gateway ? (
                    <span className="px-1.5 py-0.5 bg-surface-muted rounded border border-border">
                      {getGatewayCode(job.gateway)}
                    </span>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell>
                  {job.status === 'COMPLETED' ? (
                    <Badge variant="success" icon={<Check className="w-3 h-3" />}>
                      COMPLETED
                    </Badge>
                  ) : job.status === 'SCHEDULED' ? (
                    <Badge variant="warning" icon={<Clock className="w-3 h-3" />}>
                      SCHEDULED
                    </Badge>
                  ) : (
                    <Badge variant="neutral">{job.status}</Badge>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs text-text-secondary">{job.reason}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{job.delayMs} ms</TableCell>
                <TableCell className="text-text-secondary text-[11px]">{formatDate(job.scheduledFor)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
};
