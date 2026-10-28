import React from 'react';
import { QueueCounts } from '@payroute/shared';
import { cn } from '../../lib/cn.js';

export interface QueueGaugeProps {
  title: string;
  counts: QueueCounts;
  className?: string;
}

export const QueueGauge: React.FC<QueueGaugeProps> = ({ title, counts, className }) => {
  return (
    <div className={cn('p-3 bg-surface border border-border rounded-md', className)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-primary-dark">{title}</span>
        <span className="text-[10px] font-mono text-text-secondary uppercase">BullMQ</span>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center font-mono">
        <div className="p-1.5 bg-surface-muted rounded">
          <div className="text-[10px] text-text-secondary uppercase">Waiting</div>
          <div className="text-sm font-bold text-text tabular-nums">{counts.waiting}</div>
        </div>
        <div className="p-1.5 bg-primary-subtle rounded">
          <div className="text-[10px] text-primary-dark uppercase">Active</div>
          <div className="text-sm font-bold text-primary-dark tabular-nums">{counts.active}</div>
        </div>
        <div className="p-1.5 bg-warning-subtle rounded">
          <div className="text-[10px] text-warning-text uppercase">Delayed</div>
          <div className="text-sm font-bold text-warning-text tabular-nums">{counts.delayed}</div>
        </div>
        <div className="p-1.5 bg-error-subtle rounded">
          <div className="text-[10px] text-error-text uppercase">Failed</div>
          <div className="text-sm font-bold text-error-text tabular-nums">{counts.failed}</div>
        </div>
      </div>
    </div>
  );
};
