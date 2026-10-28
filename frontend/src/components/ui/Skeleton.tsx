import React from 'react';
import { cn } from '../../lib/cn.js';

export interface SkeletonProps {
  className?: string;
  rows?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className, rows = 1 }) => {
  if (rows > 1) {
    return (
      <div className="space-y-2 w-full">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className={cn('h-8 bg-surface-muted animate-pulse rounded', className)}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn('h-8 bg-surface-muted animate-pulse rounded w-full', className)}
    />
  );
};
