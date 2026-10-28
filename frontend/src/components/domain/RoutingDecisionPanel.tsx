import React from 'react';
import { RoutingDecision } from '@payroute/shared';
import { getGatewayCode } from '../../lib/routeGlyph.js';
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/cn.js';

export interface RoutingDecisionPanelProps {
  decision: RoutingDecision;
  className?: string;
}

export const RoutingDecisionPanel: React.FC<RoutingDecisionPanelProps> = ({ decision, className }) => {
  if (!decision) return null;

  return (
    <div className={cn('p-3 bg-surface-muted/70 border border-border rounded text-xs space-y-2 font-mono', className)}>
      <div className="flex items-center justify-between border-b border-border pb-1.5">
        <span className="font-semibold text-primary-dark">Routing Decision Log</span>
        <span className="text-[11px] text-text-secondary">Strategy: {decision.strategy}</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-text-secondary">Selected:</span>
        <span className="font-bold text-primary">{getGatewayCode(decision.selected)}</span>
        <span className="text-text-muted">|</span>
        <span className="text-text-secondary">Reason:</span>
        <span className="font-semibold text-text">{decision.reason}</span>
      </div>

      <div className="space-y-1 pt-1">
        <span className="text-[11px] font-semibold text-text-secondary uppercase">Considered Gateways:</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
          {decision.considered.map((c) => (
            <div
              key={c.gateway}
              className={cn(
                'p-2 rounded border bg-surface flex flex-col gap-1',
                c.gateway === decision.selected ? 'border-primary/60 bg-primary-subtle/30' : 'border-border'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-text">{getGatewayCode(c.gateway)}</span>
                {c.eligible ? (
                  <span className="text-success flex items-center gap-0.5 text-[11px]">
                    <CheckCircle2 className="w-3 h-3" /> Eligible
                  </span>
                ) : (
                  <span className="text-error flex items-center gap-0.5 text-[11px]">
                    <XCircle className="w-3 h-3" /> Ineligible
                  </span>
                )}
              </div>

              <div className="text-[11px] text-text-secondary flex items-center gap-2">
                <span>Circuit: <strong>{c.circuitState}</strong></span>
                <span>Health: <strong>{c.healthStatus}</strong></span>
              </div>

              {c.skippedReason && (
                <div className="text-[11px] text-error flex items-center gap-1 font-sans">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                  <span>Skipped: {c.skippedReason}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
