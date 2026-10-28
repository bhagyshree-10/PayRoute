import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.js';

export const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-text-secondary font-mono text-xs">
        Loading session...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={`/login${location.search}`} state={{ from: location }} replace />;
  }

  return <>{children}</>;
};
