import React from 'react';
import { cn } from '../../lib/cn.js';

export interface KeyValueProps {
  label: string;
  value?: React.ReactNode;
  mono?: boolean;
  className?: string;
}

export const KeyValue: React.FC<KeyValueProps> = ({ label, value, mono = false, className }) => {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <span className="text-[11px] font-medium text-text-secondary uppercase tracking-wider">{label}</span>
      <span className={cn('text-xs font-semibold text-text', mono && 'font-mono tabular-nums')}>
        {value ?? '-'}
      </span>
    </div>
  );
};
