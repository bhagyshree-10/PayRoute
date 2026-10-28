// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  validateApiUrl,
  getApiBaseUrl,
  initApiBaseUrl,
  apiClient,
  getToken,
  setToken,
  API_URL_STORAGE_KEY,
  TOKEN_KEY,
} from './client.js';

describe('API URL Resolution & Validation (client.ts)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    // Reset window.location
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateApiUrl', () => {
    it('accepts valid Cloudflare Quick Tunnel HTTPS URLs and normalizes them', () => {
      expect(validateApiUrl('https://alpha-beta-gamma.trycloudflare.com/api')).toBe(
        'https://alpha-beta-gamma.trycloudflare.com/api'
      );
      expect(validateApiUrl('https://alpha-beta-gamma.trycloudflare.com/api/')).toBe(
        'https://alpha-beta-gamma.trycloudflare.com/api'
      );
      // Automatically appends /api if root path is provided
      expect(validateApiUrl('https://alpha-beta-gamma.trycloudflare.com')).toBe(
        'https://alpha-beta-gamma.trycloudflare.com/api'
      );
      expect(validateApiUrl('https://alpha-beta-gamma.trycloudflare.com/')).toBe(
        'https://alpha-beta-gamma.trycloudflare.com/api'
      );
    });

    it('accepts valid localhost and 127.0.0.1 HTTP/HTTPS URLs', () => {
      expect(validateApiUrl('http://localhost:4000/api')).toBe('http://localhost:4000/api');
      expect(validateApiUrl('http://localhost:4000')).toBe('http://localhost:4000/api');
      expect(validateApiUrl('http://127.0.0.1:4000/api')).toBe('http://127.0.0.1:4000/api');
      expect(validateApiUrl('https://localhost:4000/api')).toBe('https://localhost:4000/api');
    });

    it('accepts same-origin relative path /api', () => {
      expect(validateApiUrl('/api')).toBe('/api');
      expect(validateApiUrl('/api/')).toBe('/api');
    });

    it('rejects remote HTTP URLs (remote APIs must strictly use HTTPS)', () => {
      expect(validateApiUrl('http://insecure-tunnel.trycloudflare.com/api')).toBeNull();
      expect(validateApiUrl('http://insecure-tunnel.trycloudflare.com')).toBeNull();
    });

    it('rejects disallowed remote domains', () => {
      expect(validateApiUrl('https://evil-attacker.com/api')).toBeNull();
      expect(validateApiUrl('https://google.com/api')).toBeNull();
      expect(validateApiUrl('https://phishing-site.org/api')).toBeNull();
      expect(validateApiUrl('http://192.168.1.100:4000/api')).toBeNull();
    });

    it('rejects URLs with unexpected paths', () => {
      expect(validateApiUrl('https://my-tunnel.trycloudflare.com/admin')).toBeNull();
      expect(validateApiUrl('https://my-tunnel.trycloudflare.com/auth/login')).toBeNull();
      expect(validateApiUrl('https://my-tunnel.trycloudflare.com/evil/path/endpoint')).toBeNull();
      expect(validateApiUrl('/invalid/relative/path')).toBeNull();
    });

    it('rejects URLs containing embedded credentials', () => {
      expect(validateApiUrl('https://user:pass@my-tunnel.trycloudflare.com/api')).toBeNull();
      expect(validateApiUrl('https://admin@my-tunnel.trycloudflare.com/api')).toBeNull();
    });

    it('rejects dangerous protocols', () => {
      expect(validateApiUrl('javascript:alert(1)')).toBeNull();
      expect(validateApiUrl('file:///etc/passwd')).toBeNull();
      expect(validateApiUrl('data:text/html,test')).toBeNull();
    });

    it('rejects malformed or empty inputs', () => {
      expect(validateApiUrl('')).toBeNull();
      expect(validateApiUrl('   ')).toBeNull();
      expect(validateApiUrl(null)).toBeNull();
      expect(validateApiUrl(undefined)).toBeNull();
      expect(validateApiUrl('not-a-valid-url')).toBeNull();
      expect(validateApiUrl('://missing-scheme')).toBeNull();
    });
  });

  describe('getApiBaseUrl', () => {
    it('uses valid ?api= query parameter and persists to sessionStorage', () => {
      window.history.replaceState({}, '', '/?api=https://active-session.trycloudflare.com/api');

      const resolved = getApiBaseUrl();
      expect(resolved).toBe('https://active-session.trycloudflare.com/api');
      expect(sessionStorage.getItem(API_URL_STORAGE_KEY)).toBe(
        'https://active-session.trycloudflare.com/api'
      );
    });

    it('decodes percent-encoded query parameter correctly', () => {
      window.history.replaceState(
        {},
        '',
        '/?api=https%3A%2F%2Fencoded-session.trycloudflare.com%2Fapi'
      );

      const resolved = getApiBaseUrl();
      expect(resolved).toBe('https://encoded-session.trycloudflare.com/api');
      expect(sessionStorage.getItem(API_URL_STORAGE_KEY)).toBe(
        'https://encoded-session.trycloudflare.com/api'
      );
    });

    it('isolates credentials: clears token if ?api= changes to a new backend URL', () => {
      sessionStorage.setItem(API_URL_STORAGE_KEY, 'https://old-backend.trycloudflare.com/api');
      sessionStorage.setItem(TOKEN_KEY, 'stale_jwt_token_123');

      // User visits with new backend
      window.history.replaceState({}, '', '/?api=https://new-backend.trycloudflare.com/api');

      const resolved = getApiBaseUrl();
      expect(resolved).toBe('https://new-backend.trycloudflare.com/api');
      // Token must be wiped to prevent sending credentials to a new host
      expect(getToken()).toBeNull();
    });

    it('reads from sessionStorage when no query parameter is present', () => {
      sessionStorage.setItem(API_URL_STORAGE_KEY, 'https://stored-backend.trycloudflare.com/api');
      window.history.replaceState({}, '', '/transactions');

      const resolved = getApiBaseUrl();
      expect(resolved).toBe('https://stored-backend.trycloudflare.com/api');
    });

    it('discards invalid / tampered sessionStorage values and falls back', () => {
      sessionStorage.setItem(API_URL_STORAGE_KEY, 'https://evil-attacker.com/api');
      window.history.replaceState({}, '', '/');

      const resolved = getApiBaseUrl();
      // Invalid entry was deleted
      expect(sessionStorage.getItem(API_URL_STORAGE_KEY)).toBeNull();
      // Falls back to default
      expect(resolved).toMatch(/\/api/);
    });

    it('ignores invalid query parameter and falls back to sessionStorage or default', () => {
      sessionStorage.setItem(API_URL_STORAGE_KEY, 'https://valid-stored.trycloudflare.com/api');
      window.history.replaceState({}, '', '/?api=javascript:alert(1)');

      const resolved = getApiBaseUrl();
      expect(resolved).toBe('https://valid-stored.trycloudflare.com/api');
    });

    it('falls back to default when both query parameter and sessionStorage are absent', () => {
      window.history.replaceState({}, '', '/');

      const resolved = getApiBaseUrl();
      expect(resolved).toMatch(/\/api/);
    });

    it('eagerly captures ?api= URL on initialization so it survives subsequent navigation to /login without query params', () => {
      // 1. User arrives at root with active tunnel in query parameter
      window.history.replaceState(
        {},
        '',
        '/?api=https://refugees-approved-pursuit-anna.trycloudflare.com/api'
      );

      // 2. App boots and eagerly initializes base URL
      const initial = initApiBaseUrl();
      expect(initial).toBe('https://refugees-approved-pursuit-anna.trycloudflare.com/api');
      expect(sessionStorage.getItem(API_URL_STORAGE_KEY)).toBe(
        'https://refugees-approved-pursuit-anna.trycloudflare.com/api'
      );

      // 3. User is redirected to /login where query params were stripped
      window.history.replaceState({}, '', '/login');

      // 4. On /login, getApiBaseUrl must still resolve to the validated tunnel, not fallback /api
      const resolvedOnLogin = getApiBaseUrl();
      expect(resolvedOnLogin).toBe(
        'https://refugees-approved-pursuit-anna.trycloudflare.com/api'
      );
    });
  });

  describe('apiClient Integration with Dynamic URL', () => {
    it('constructs request with dynamically resolved base URL and preserves headers', async () => {
      window.history.replaceState({}, '', '/?api=https://test-tunnel.trycloudflare.com/api');
      setToken('valid_jwt_abc');

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ status: 'ok', data: { id: 1 } }),
      } as any);

      const result = await apiClient('/admin/health');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://test-tunnel.trycloudflare.com/api/admin/health',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer valid_jwt_abc',
          }),
        })
      );
      expect(result).toEqual({ status: 'ok', data: { id: 1 } });
    });

    it('dispatches login POST to validated tunnel URL instead of same-origin /api after redirect to /login', async () => {
      // 1. User arrived at /?api=https://refugees-approved-pursuit-anna.trycloudflare.com/api
      window.history.replaceState(
        {},
        '',
        '/?api=https://refugees-approved-pursuit-anna.trycloudflare.com/api'
      );
      initApiBaseUrl();

      // 2. User redirected to /login
      window.history.replaceState({}, '', '/login');

      // 3. User submits login form
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          data: {
            token: 'test_token',
            user: { id: 'usr_1', name: 'Admin', email: 'admin@example.com' },
          },
        }),
      } as any);

      await apiClient('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'admin@example.com', password: 'password' }),
      });

      // Must call the tunnel endpoint, NOT https://payroute-dashboard.pages.dev/api/auth/login
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://refugees-approved-pursuit-anna.trycloudflare.com/api/auth/login',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('clears token on 401 response and redirects to /login', async () => {
      setToken('expired_token');
      // jsdom does not implement full navigation; suppress jsdom's virtual console error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({
          error: {
            code: 'UNAUTHORIZED',
            category: 'auth',
            message: 'Token expired',
            requestId: 'req_1',
          },
        }),
      } as any);

      await expect(apiClient('/admin/overview')).rejects.toThrow();
      expect(getToken()).toBeNull();

      consoleErrorSpy.mockRestore();
    });
  });
});
