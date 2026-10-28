import React from 'react';
import { cn } from '../../lib/cn.js';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, activeTab, onChange, className }) => {
  return (
    <div className={cn('flex items-center border-b border-border gap-1', className)}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              'px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 focus:outline-none focus:text-primary',
              isActive
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-text-secondary hover:text-text hover:border-border-strong'
            )}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={cn(
                  'px-1.5 py-0.5 text-[10px] font-mono rounded-full',
                  isActive ? 'bg-primary-subtle text-primary-dark' : 'bg-surface-muted text-text-muted'
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
