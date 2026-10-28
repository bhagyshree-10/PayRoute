import React from 'react';
import { OverviewKpis } from '@payroute/shared';
import { Card } from '../ui/Card.js';
import { Activity, ArrowDownRight, CheckCircle2, Clock, RefreshCw, ShieldCheck } from 'lucide-react';
import { cn } from '../../lib/cn.js';

export interface KpiStripProps {
  kpis: OverviewKpis;
  className?: string;
}

export const KpiStrip: React.FC<KpiStripProps> = ({ kpis, className }) => {
  const successPct = kpis.successRate != null ? (kpis.successRate * 100).toFixed(1) : '0.0';

  const items = [
    {
      label: 'Success Rate',
      value: `${successPct}%`,
      subtext: `${kpis.transactions} total txns`,
      icon: <CheckCircle2 className="w-4 h-4 text-success" />,
      valueColor: 'text-primary-dark',
    },
    {
      label: 'Transactions',
      value: kpis.transactions.toString(),
      subtext: 'Completed in window',
      icon: <Activity className="w-4 h-4 text-primary" />,
      valueColor: 'text-primary-dark',
    },
    {
      label: 'Avg Latency',
      value: `${kpis.avgLatencyMs} ms`,
      subtext: 'p95 gateway response',
      icon: <Clock className="w-4 h-4 text-accent" />,
      valueColor: 'text-primary-dark',
    },
    {
      label: 'Retries Scheduled',
      value: kpis.retriesScheduled.toString(),
      subtext: 'Transient backoff retries',
      icon: <RefreshCw className="w-4 h-4 text-warning" />,
      valueColor: 'text-warning-text',
    },
    {
      label: 'Fallbacks Used',
      value: kpis.fallbacks.toString(),
      subtext: 'Routed to 2nd gateway',
      icon: <ArrowDownRight className="w-4 h-4 text-warning" />,
      valueColor: 'text-warning-text',
    },
    {
      label: 'Duplicate Webhooks',
      value: kpis.duplicateWebhooksIgnored.toString(),
      subtext: 'Safely absorbed',
      icon: <ShieldCheck className="w-4 h-4 text-success" />,
      valueColor: 'text-success-text',
    },
  ];

  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3', className)}>
      {items.map((item, idx) => (
        <Card key={idx} className="p-3">
          <div className="flex items-center justify-between text-text-secondary mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">{item.label}</span>
            {item.icon}
          </div>
          <div className={cn('text-xl font-bold font-mono tabular-nums mt-0.5', item.valueColor)}>
            {item.value}
          </div>
          <div className="text-[10px] text-text-secondary mt-1">{item.subtext}</div>
        </Card>
      ))}
    </div>
  );
};
