// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { RequireAuth } from './RequireAuth.js';
import * as AuthContextModule from './AuthContext.js';

describe('RequireAuth Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const LocationDisplay = () => {
    const location = useLocation();
    return (
      <div>
        <div data-testid="pathname">{location.pathname}</div>
        <div data-testid="search">{location.search}</div>
      </div>
    );
  };

  it('preserves query parameters (?api=...) when redirecting unauthenticated users to /login', () => {
    // Mock useAuth returning unauthenticated
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      token: null,
      login: vi.fn(),
      logout: vi.fn(),
      isAuthenticated: false,
      isLoading: false,
    });

    render(
      <MemoryRouter initialEntries={['/?api=https://test-tunnel.trycloudflare.com/api']}>
        <Routes>
          <Route
            path="/"
            element={
              <RequireAuth>
                <div>Protected Content</div>
              </RequireAuth>
            }
          />
          <Route path="/login" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>
    );

    // Assert redirected to /login
    expect(screen.getByTestId('pathname').textContent).toBe('/login');
    // Assert query parameter was preserved on redirect
    expect(screen.getByTestId('search').textContent).toBe(
      '?api=https://test-tunnel.trycloudflare.com/api'
    );
    // Protected content was not rendered
    expect(screen.queryByText('Protected Content')).toBeNull();
  });

  it('renders children when authenticated without redirecting', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'usr_1', name: 'Admin', email: 'admin@example.com' },
      token: 'valid_token',
      login: vi.fn(),
      logout: vi.fn(),
      isAuthenticated: true,
      isLoading: false,
    });

    render(
      <MemoryRouter initialEntries={['/?api=https://test-tunnel.trycloudflare.com/api']}>
        <Routes>
          <Route
            path="/"
            element={
              <RequireAuth>
                <div>Protected Content</div>
              </RequireAuth>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Protected Content')).toBeDefined();
  });
});
