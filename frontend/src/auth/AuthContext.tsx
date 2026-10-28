import React, { createContext, useContext, useState, useEffect } from 'react';
import { getToken, setToken, apiClient } from '../api/client.js';

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tokenState, setTokenState] = useState<string | null>(getToken());
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = sessionStorage.getItem('payroute_user');
    if (savedUser) {
      try {
        return JSON.parse(savedUser);
      } catch {
        return null;
      }
    }
    // Default admin mock user if in mock mode
    if (import.meta.env.VITE_USE_MOCKS === 'true') {
      return {
        id: 'usr_01H8X700000000000000000000',
        name: 'Demo Admin',
        email: 'admin@example.com',
      };
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(false);

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    sessionStorage.setItem('payroute_user', JSON.stringify(newUser));
    setTokenState(newToken);
    setUser(newUser);
  };

  const logout = () => {
    setToken(null);
    sessionStorage.removeItem('payroute_user');
    setTokenState(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token: tokenState,
        login,
        logout,
        isAuthenticated: Boolean(tokenState || import.meta.env.VITE_USE_MOCKS === 'true'),
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
