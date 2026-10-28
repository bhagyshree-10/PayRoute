import React from 'react';
import { CircuitState } from '@payroute/shared';
import { cn } from '../../lib/cn.js';

export interface CircuitStateIndicatorProps {
  state: CircuitState;
  showDiagram?: boolean;
  className?: string;
}

export const CircuitStateIndicator: React.FC<CircuitStateIndicatorProps> = ({
  state,
  showDiagram = false,
  className
}) => {
  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <div className="flex items-center gap-1.5 font-mono text-xs font-semibold uppercase">
        {state === 'CLOSED' && (
          <>
            <span className="w-2.5 h-2.5 rounded-full bg-success inline-block" />
            <span className="text-success-text">CLOSED</span>
          </>
        )}
        {state === 'OPEN' && (
          <>
            <span className="w-2.5 h-2.5 bg-error inline-block" />
            <span className="text-error-text">OPEN</span>
          </>
        )}
        {state === 'HALF_OPEN' && (
          <>
            <span className="w-2.5 h-2.5 rounded-full border-2 border-warning bg-warning/40 inline-block" />
            <span className="text-warning-text">HALF_OPEN</span>
          </>
        )}
      </div>

      {showDiagram && (
        <div className="hidden sm:flex items-center text-[10px] font-mono gap-1 text-text-muted bg-surface-muted px-2 py-0.5 rounded border border-border">
          <span className={cn(state === 'CLOSED' && 'text-success font-bold')}>CLOSED</span>
          <span>→</span>
          <span className={cn(state === 'OPEN' && 'text-error font-bold')}>OPEN</span>
          <span>→</span>
          <span className={cn(state === 'HALF_OPEN' && 'text-warning font-bold')}>HALF_OPEN</span>
        </div>
      )}
    </div>
  );
};
