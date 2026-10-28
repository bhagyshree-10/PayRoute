import React from 'react';
import { LucideIcon, Inbox } from 'lucide-react';
import { cn } from '../../lib/cn.js';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center bg-surface border border-border rounded-md my-4',
        className
      )}
    >
      <div className="p-3 bg-surface-muted rounded-full mb-3 text-text-muted">
        <Icon className="w-6 h-6" />
      </div>
      <h4 className="text-sm font-semibold text-text mb-1">{title}</h4>
      <p className="text-xs text-text-secondary max-w-sm mb-4">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
};
