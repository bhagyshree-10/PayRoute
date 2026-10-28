import React from 'react';
import { PaymentAttempt, RetryJobRecord, TransactionStatus } from '@payroute/shared';
import { getGatewayCode } from '../../lib/routeGlyph.js';
import { Check, X, Clock, ArrowRight, CornerDownRight } from 'lucide-react';
import { cn } from '../../lib/cn.js';

export interface RouteTraceProps {
  attempts: PaymentAttempt[];
  status: TransactionStatus;
  retryJobs?: RetryJobRecord[];
  className?: string;
}

export const RouteTrace: React.FC<RouteTraceProps> = ({
  attempts = [],
  status,
  retryJobs = [],
  className,
}) => {
  if (attempts.length === 0) {
    return (
      <div className={cn('p-4 text-xs font-mono text-text-muted bg-surface-muted rounded border border-border', className)}>
        No attempts recorded yet.
      </div>
    );
  }

  const isSuccess = status === 'SUCCESS';

  return (
    <div className={cn('w-full py-2', className)}>
      {/* Desktop Horizontal View */}
      <div className="hidden md:flex items-center flex-wrap gap-y-4 overflow-x-auto py-2 px-1">
        {attempts.map((attempt, index) => {
          const code = getGatewayCode(attempt.gateway);
          const isLastAttempt = index === attempts.length - 1;
          const nextAttempt = attempts[index + 1];
          const isFallbackNext = nextAttempt && nextAttempt.gateway !== attempt.gateway;

          // Find backoff delay from retryJobs
          const matchingJob = retryJobs.find(
            (j) => j.attemptNumber === attempt.attemptNumber + 1
          );
          const delayText = matchingJob?.delayMs
            ? `+${(matchingJob.delayMs / 1000).toFixed(1)}s`
            : '+1.0s';

          return (
            <React.Fragment key={attempt.id || index}>
              {/* Attempt Node (24px square) */}
              <div
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 bg-surface border rounded font-mono text-xs select-none shadow-sm',
                  attempt.status === 'SUCCEEDED' || attempt.status === 'ACCEPTED'
                    ? 'border-success text-success-text bg-success-subtle'
                    : attempt.status === 'FAILED'
                    ? 'border-error text-error-text bg-error-subtle'
                    : 'border-border-strong text-primary-dark bg-surface-muted'
                )}
                title={`Attempt #${attempt.attemptNumber} on ${attempt.gateway} (${attempt.status})`}
              >
                <span className="font-bold">{code}</span>
                {attempt.status === 'SUCCEEDED' || attempt.status === 'ACCEPTED' ? (
                  <Check className="w-3.5 h-3.5 text-success" />
                ) : attempt.status === 'FAILED' ? (
                  <X className="w-3.5 h-3.5 text-error" />
                ) : (
                  <Clock className="w-3.5 h-3.5 text-primary" />
                )}
              </div>

              {/* Connector */}
              {!isLastAttempt && (
                <div className="flex items-center px-2">
                  {isFallbackNext ? (
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-mono text-error font-bold tracking-wider">
                        FALLBACK
                      </span>
                      <div className="w-12 h-1 border-t-2 border-b-2 border-error my-0.5" />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-mono text-text-muted">
                        {delayText}
                      </span>
                      <div
                        className={cn(
                          'w-10 h-0.5 my-0.5',
                          isSuccess ? 'bg-accent' : 'bg-border-strong'
                        )}
                      />
                    </div>
                  )}
                </div>
              )}
            </React.Fragment>
          );
        })}

        {/* Webhook Terminal Confirmation Node */}
        <div className="flex items-center px-2">
          <div
            className={cn(
              'w-8 h-0.5',
              isSuccess ? 'bg-accent' : 'bg-border-strong'
            )}
          />
          <ArrowRight
            className={cn('w-4 h-4 -ml-1', isSuccess ? 'text-accent' : 'text-text-muted')}
          />
        </div>

        <div
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded font-mono text-xs font-semibold uppercase',
            isSuccess
              ? 'bg-success-subtle border border-success text-success-text'
              : status === 'AWAITING_CONFIRMATION'
              ? 'bg-surface-muted border border-border-strong text-primary-dark'
              : 'bg-error-subtle border border-error text-error-text'
          )}
        >
          <span>Webhook → {status === 'AWAITING_CONFIRMATION' ? 'AWAITING' : status}</span>
        </div>
      </div>

      {/* Mobile Vertical View */}
      <div className="flex md:hidden flex-col gap-3 p-3 bg-surface border border-border rounded-md">
        {attempts.map((attempt, index) => {
          const code = getGatewayCode(attempt.gateway);
          const isLastAttempt = index === attempts.length - 1;
          const nextAttempt = attempts[index + 1];
          const isFallbackNext = nextAttempt && nextAttempt.gateway !== attempt.gateway;

          return (
            <div key={attempt.id || index} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between font-mono text-xs">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-surface-muted border border-border rounded font-bold">
                    {code}
                  </span>
                  <span>Attempt #{attempt.attemptNumber}</span>
                </div>
                <div>
                  {attempt.status === 'SUCCEEDED' || attempt.status === 'ACCEPTED' ? (
                    <span className="text-success flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> OK
                    </span>
                  ) : (
                    <span className="text-error flex items-center gap-1">
                      <X className="w-3.5 h-3.5" /> FAILED
                    </span>
                  )}
                </div>
              </div>

              {!isLastAttempt && (
                <div className="flex items-center gap-2 text-xs font-mono text-text-muted pl-4">
                  <CornerDownRight className="w-3.5 h-3.5" />
                  {isFallbackNext ? (
                    <span className="text-error font-bold">FALLBACK → {getGatewayCode(nextAttempt.gateway)}</span>
                  ) : (
                    <span>Retry after delay</span>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div className="pt-2 border-t border-border flex items-center justify-between font-mono text-xs font-semibold">
          <span className="text-text-secondary">Webhook Confirmation:</span>
          <span className={cn(isSuccess ? 'text-success' : 'text-error')}>{status}</span>
        </div>
      </div>
    </div>
  );
};
