import React from 'react';
import { cn } from '../../lib/cn.js';

export interface StatusDotProps {
  status?: 'success' | 'warning' | 'error' | 'neutral' | 'in-progress';
  size?: 'sm' | 'md';
  ping?: boolean;
  className?: string;
}

export const StatusDot: React.FC<StatusDotProps> = ({
  status = 'neutral',
  size = 'md',
  ping = false,
  className
}) => {
  const sizeClass = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';

  const statusBg = {
    success: 'bg-success',
    warning: 'bg-warning',
    error: 'bg-error',
    neutral: 'bg-text-muted',
    'in-progress': 'bg-primary'
  };

  return (
    <span className="relative inline-flex items-center justify-center">
      {ping && (
        <span
          className={cn(
            'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
            statusBg[status]
          )}
        />
      )}
      <span className={cn('relative inline-flex rounded-full', sizeClass, statusBg[status], className)} />
    </span>
  );
};
