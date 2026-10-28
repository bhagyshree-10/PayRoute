import React, { createContext, useContext, useState, useCallback } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { CopyableId } from './CopyableId.js';
import { cn } from '../../lib/cn.js';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  requestId?: string;
}

interface ToastContextType {
  toast: (type: ToastType, title: string, message?: string, requestId?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (type: ToastType, title: string, message?: string, requestId?: string) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: ToastMessage = { id, type, title, message, requestId };

      setToasts((prev) => [...prev.slice(-2), newToast]);

      if (type !== 'error') {
        setTimeout(() => {
          removeToast(id);
        }, 4000);
      }
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 md:px-0"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto p-3.5 rounded-md border shadow-lg flex items-start gap-3 text-xs transition-all animate-in slide-in-from-bottom-2 duration-150',
              t.type === 'success' && 'bg-success-subtle border-success text-success-text',
              t.type === 'error' && 'bg-error-subtle border-error text-error-text',
              t.type === 'info' && 'bg-accent-subtle border-accent text-text'
            )}
          >
            {t.type === 'success' && <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />}
            {t.type === 'error' && <AlertCircle className="w-4 h-4 text-error flex-shrink-0 mt-0.5" />}
            {t.type === 'info' && <Info className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />}

            <div className="flex-1 min-w-0">
              <div className="font-semibold text-text">{t.title}</div>
              {t.message && <p className="mt-0.5 text-text-secondary">{t.message}</p>}
              {t.requestId && (
                <div className="mt-1 text-[11px] text-text-muted">
                  Req ID: <CopyableId id={t.requestId} truncate={false} />
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => removeToast(t.id)}
              className="p-1 rounded text-text-muted hover:text-text hover:bg-surface/50 transition-colors"
              aria-label="Dismiss toast"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
