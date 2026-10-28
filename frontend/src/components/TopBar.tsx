import React from 'react';
import { useLocation } from 'react-router-dom';
import { navItems } from './Sidebar.js';
import { AlertCircle, Menu, LogOut, User } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.js';
import { Button } from './ui/Button.js';
import { cn } from '../lib/cn.js';

export interface TopBarProps {
  onOpenMobileNav: () => void;
  className?: string;
}

export const TopBar: React.FC<TopBarProps> = ({ onOpenMobileNav, className }) => {
  const location = useLocation();
  const { user, logout } = useAuth();

  const currentNav = navItems.find((item) =>
    item.path === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(item.path)
  );

  const pageTitle = currentNav ? currentNav.label : 'Dashboard';

  return (
    <header
      className={cn(
        'h-12 bg-surface border-b border-border px-4 flex items-center justify-between z-20 sticky top-0',
        className
      )}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="md:hidden p-1.5 rounded text-text-secondary hover:bg-surface-muted focus:outline-none"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <h1 className="text-sm font-semibold text-primary-dark">{pageTitle}</h1>
      </div>

      <div className="flex items-center gap-3">
        {/* TEST MODE Pill */}
        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded border border-warning bg-warning-subtle text-warning-text text-[11px] font-mono font-semibold select-none">
          <AlertCircle className="w-3.5 h-3.5 text-warning" />
          <span>TEST MODE</span>
        </div>

        {/* User Account Controls */}
        <div className="flex items-center gap-2 pl-2 border-l border-border">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-text-secondary font-medium">
            <User className="w-3.5 h-3.5 text-primary" />
            <span>{user?.name || user?.email || 'Operator'}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            icon={<LogOut className="w-3.5 h-3.5" />}
            title="Log out"
          >
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </div>
    </header>
  );
};
