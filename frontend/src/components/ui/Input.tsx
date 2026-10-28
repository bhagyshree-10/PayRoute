import React, { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn.js';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-xs font-medium text-text-secondary">
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={cn(
            'h-8 px-2.5 bg-surface border border-border-strong rounded text-xs text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 transition-colors',
            error && 'border-error focus:ring-error',
            className
          )}
          {...props}
        />
        {error && <span className="text-[11px] text-error">{error}</span>}
        {hint && !error && <span className="text-[11px] text-text-secondary">{hint}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
