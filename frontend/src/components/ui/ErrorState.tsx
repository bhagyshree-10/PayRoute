import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from './Button.js';
import { CopyableId } from './CopyableId.js';
import { cn } from '../../lib/cn.js';

export interface ErrorStateProps {
  code?: string;
  message: string;
  requestId?: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  code = 'ERROR',
  message,
  requestId,
  onRetry,
  className,
}) => {
  return (
    <div
      className={cn(
        'p-4 bg-error-subtle border border-error rounded-md text-error-text my-4 flex flex-col gap-3',
        className
      )}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider">{code}</span>
            {requestId && (
              <span className="text-xs text-text-secondary">
                (Request ID: <CopyableId id={requestId} truncate={false} />)
              </span>
            )}
          </div>
          <p className="text-xs leading-relaxed">{message}</p>
        </div>
      </div>
      {onRetry && (
        <div className="flex justify-end pt-1 border-t border-error/20">
          <Button variant="secondary" size="sm" icon={<RotateCcw className="w-3 h-3" />} onClick={onRetry}>
            Retry Request
          </Button>
        </div>
      )}
    </div>
  );
};
