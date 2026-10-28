import React from 'react';
import { cn } from '../../lib/cn.js';

export type BadgeVariant = 'success' | 'warning' | 'error' | 'neutral' | 'in-progress' | 'outline';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  icon?: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  icon,
  className,
}) => {
  const variantStyles = {
    success: 'bg-success-subtle text-success-text',
    warning: 'bg-warning-subtle text-warning-text',
    error: 'bg-error-subtle text-error-text',
    neutral: 'bg-surface-muted text-text-secondary',
    'in-progress': 'bg-surface-muted text-primary-dark border border-border-strong',
    outline: 'bg-transparent text-primary-dark border border-border-strong',
  };

  const iconColorStyles = {
    success: 'text-success',
    warning: 'text-warning',
    error: 'text-error',
    neutral: 'text-text-muted',
    'in-progress': 'text-primary',
    outline: 'text-primary',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center h-5 px-2 rounded-[2px] text-[11px] font-mono font-medium uppercase tracking-wider gap-1.5 select-none leading-none',
        variantStyles[variant],
        className
      )}
    >
      {icon && <span className={cn('flex-shrink-0 w-3 h-3', iconColorStyles[variant])}>{icon}</span>}
      <span>{children}</span>
    </span>
  );
};
