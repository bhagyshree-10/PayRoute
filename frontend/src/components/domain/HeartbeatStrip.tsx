import React from 'react';
import { GatewayActivity60mBucket } from '@payroute/shared';
import { Tooltip } from '../ui/Tooltip.js';
import { cn } from '../../lib/cn.js';

export interface HeartbeatStripProps {
  activity: GatewayActivity60mBucket[];
  className?: string;
}

export const HeartbeatStrip: React.FC<HeartbeatStripProps> = ({ activity = [], className }) => {
  // Ensure exactly 60 cells
  const cells = Array.from({ length: 60 }, (_, i) => {
    return activity[i] || { t: `${i}m`, ok: 0, fault: 0 };
  });

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between text-[11px] font-mono text-text-secondary">
        <span>60m Activity Heartbeat</span>
        <span>Now →</span>
      </div>

      <div className="flex items-center gap-[1px] bg-surface p-1 rounded border border-border overflow-x-auto">
        {cells.map((cell, idx) => {
          const total = cell.ok + cell.fault;
          const hasFault = cell.fault > 0;

          let bgClass = 'bg-border'; // No traffic
          if (total > 0) {
            bgClass = hasFault ? 'bg-error' : 'bg-success';
          }

          const tooltipText = `${cell.t}: ${total} reqs (${cell.ok} ok, ${cell.fault} faults)`;

          return (
            <Tooltip key={idx} content={tooltipText} position="top">
              <div
                className={cn('w-[4px] h-[16px] rounded-[1px] relative transition-colors', bgClass)}
              >
                {/* Accessibility marker for fault cells (bottom 2px marker) */}
                {hasFault && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-error-text" />
                )}
              </div>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
};
