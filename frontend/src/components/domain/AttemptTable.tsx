import React, { useState } from 'react';
import { PaymentAttempt } from '@payroute/shared';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table.js';
import { Badge } from '../ui/Badge.js';
import { CopyableId } from '../ui/CopyableId.js';
import { RoutingDecisionPanel } from './RoutingDecisionPanel.js';
import { formatDate, formatLatency } from '../../lib/format.js';
import { getGatewayCode } from '../../lib/routeGlyph.js';
import { ChevronDown, ChevronRight, Check, X, Clock } from 'lucide-react';
import { cn } from '../../lib/cn.js';

export interface AttemptTableProps {
  attempts: PaymentAttempt[];
  className?: string;
}

export const AttemptTable: React.FC<AttemptTableProps> = ({ attempts = [], className }) => {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const toggleRow = (id: string) => {
    setExpandedRow((prev) => (prev === id ? null : id));
  };

  if (attempts.length === 0) {
    return <div className="text-xs text-text-muted p-3">No attempt history available.</div>;
  }

  return (
    <div className={cn('w-full', className)}>
      <Table caption="Payment Attempts">
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"></TableHead>
            <TableHead>Attempt #</TableHead>
            <TableHead>Attempt ID</TableHead>
            <TableHead>Gateway</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Gateway Ref</TableHead>
            <TableHead className="text-right">Latency</TableHead>
            <TableHead>Started At</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {attempts.map((att) => {
            const isExpanded = expandedRow === att.id;
            const code = getGatewayCode(att.gateway);

            return (
              <React.Fragment key={att.id}>
                <TableRow
                  className="cursor-pointer hover:bg-surface-muted/80"
                  onClick={() => toggleRow(att.id)}
                >
                  <TableCell>
                    <button
                      type="button"
                      className="p-0.5 text-text-secondary focus:outline-none"
                      aria-label="Toggle details"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-primary" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>
                  </TableCell>
                  <TableCell className="font-mono font-semibold">#{att.attemptNumber}</TableCell>
                  <TableCell>
                    <CopyableId id={att.id} />
                  </TableCell>
                  <TableCell>
                    <span className="font-mono font-bold text-text-secondary bg-surface-muted px-1.5 py-0.5 rounded border border-border">
                      {code}
                    </span>
                  </TableCell>
                  <TableCell>
                    {att.status === 'SUCCEEDED' || att.status === 'ACCEPTED' ? (
                      <Badge variant="success" icon={<Check className="w-3 h-3" />}>
                        {att.status}
                      </Badge>
                    ) : att.status === 'FAILED' ? (
                      <Badge variant="error" icon={<X className="w-3 h-3" />}>
                        FAILED
                      </Badge>
                    ) : (
                      <Badge variant="in-progress" icon={<Clock className="w-3 h-3" />}>
                        {att.status}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-text-secondary">
                    {att.gatewayReference ? <CopyableId id={att.gatewayReference} /> : '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatLatency(att.latencyMs)}
                  </TableCell>
                  <TableCell className="text-text-secondary text-[11px]">
                    {formatDate(att.startedAt)}
                  </TableCell>
                </TableRow>

                {isExpanded && (
                  <tr className="bg-surface-muted/30">
                    <td colSpan={8} className="p-4 border-b border-border">
                      <div className="space-y-3">
                        {att.error && (
                          <div className="p-3 bg-error-subtle border border-error rounded text-xs text-error-text">
                            <span className="font-mono font-bold uppercase">{att.error.kind}</span>
                            <span className="ml-2">({att.error.retryClass})</span>
                            <p className="mt-1 font-sans">{att.error.message}</p>
                          </div>
                        )}
                        <RoutingDecisionPanel decision={att.routingDecision} />
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
