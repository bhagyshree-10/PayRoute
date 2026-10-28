import React, { useState } from 'react';
import { Sidebar } from './Sidebar.js';
import { TopBar } from './TopBar.js';
import { Drawer } from './ui/Drawer.js';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden md:block h-full">
        <Sidebar />
      </div>

      {/* Mobile Drawer Navigation */}
      <Drawer
        isOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
        title="Navigation"
      >
        <Sidebar className="w-full border-r-0" onNavigate={() => setIsMobileNavOpen(false)} />
      </Drawer>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <TopBar onOpenMobileNav={() => setIsMobileNavOpen(true)} />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
