import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  CreditCard,
  Radio,
  Webhook,
  RotateCcw,
  Activity
} from 'lucide-react';
import { cn } from '../lib/cn.js';

export interface SidebarProps {
  className?: string;
  onNavigate?: () => void;
}

export const navItems = [
  { path: '/', label: 'Overview', icon: LayoutDashboard },
  { path: '/transactions', label: 'Transactions', icon: CreditCard },
  { path: '/gateways', label: 'Gateways', icon: Radio },
  { path: '/webhooks', label: 'Webhooks', icon: Webhook },
  { path: '/retries', label: 'Retry Jobs', icon: RotateCcw },
  { path: '/health', label: 'System Health', icon: Activity },
];

export const Sidebar: React.FC<SidebarProps> = ({ className, onNavigate }) => {
  return (
    <aside
      className={cn(
        'w-[220px] bg-surface border-r border-border flex flex-col flex-shrink-0 h-full select-none',
        className
      )}
    >
      {/* Brand Wordmark */}
      <div className="h-12 px-5 flex items-center border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-primary flex items-center justify-center text-white font-bold text-xs tracking-wider">
            PR
          </div>
          <span className="font-bold text-base tracking-tight text-primary-dark">PayRoute</span>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded text-xs font-medium transition-colors relative',
                  isActive
                    ? 'text-primary font-semibold bg-primary-subtle border-l-2 border-l-primary -ml-[2px]'
                    : 'text-text-secondary hover:text-text hover:bg-surface-muted'
                )
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border text-[11px] text-text-muted font-mono">
        PayRoute v1.0 MVP
      </div>
    </aside>
  );
};
