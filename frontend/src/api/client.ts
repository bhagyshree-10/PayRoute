import { ApiErrorResponse } from '@payroute/shared';

export const API_URL_STORAGE_KEY = 'payroute_api_url';
export const TOKEN_KEY = 'payroute_jwt_token';

// Allowed host patterns: Cloudflare Quick Tunnels, Cloudflare Pages, Ngrok free, localhost, or configured host
const ALLOWED_HOST_REGEX = /^([a-zA-Z0-9-]+\.)*(trycloudflare\.com|pages\.dev|ngrok-free\.app|localhost)$/i;

/**
 * Validates a candidate API base URL against strict security criteria:
 * - Remote APIs MUST use HTTPS.
 * - Localhost allows HTTP or HTTPS.
 * - Rejects malformed URLs, non-HTTP protocols, and URLs with embedded credentials.
 * - Rejects untrusted remote domains.
 * - Rejects unexpected paths (must be empty, '/', or '/api').
 * - Normalizes valid URLs to end with '/api' without trailing slashes.
 */
export function validateApiUrl(candidate: string | null | undefined): string | null {
  if (!candidate || typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;

  try {
    // Relative paths like '/api' are valid on same-origin
    if (trimmed.startsWith('/')) {
      const normalizedPath = trimmed.replace(/\/+$/, '');
      return normalizedPath === '' || normalizedPath === '/api' ? '/api' : null;
    }

    const parsed = new URL(trimmed);

    // Reject embedded credentials (user:pass@...)
    if (parsed.username || parsed.password) {
      return null;
    }

    // Protocol validation: remote URLs MUST be https:
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (isLocalhost) {
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
      }
    } else {
      if (parsed.protocol !== 'https:') {
        return null;
      }
    }

    // Hostname validation
    const configuredBase = import.meta.env?.VITE_API_BASE_URL;
    let configuredHost: string | null = null;
    if (configuredBase && configuredBase.startsWith('http')) {
      try {
        configuredHost = new URL(configuredBase).hostname.toLowerCase();
      } catch {}
    }

    const hostname = parsed.hostname.toLowerCase();
    const isAllowedHost =
      isLocalhost ||
      ALLOWED_HOST_REGEX.test(hostname) ||
      (configuredHost !== null && hostname === configuredHost);

    if (!isAllowedHost) {
      return null;
    }

    // Path validation: must be '/api', root '/', or empty (normalized to '/api')
    const pathname = parsed.pathname.replace(/\/+$/, '');
    if (pathname !== '' && pathname !== '/api') {
      return null; // Reject unexpected paths (e.g. /malicious/endpoint)
    }

    // Normalize to standard origin + '/api'
    return `${parsed.origin}/api`;
  } catch {
    return null; // Malformed URL
  }
}

/**
 * Resolves the active API base URL with the following precedence:
 * 1. Validated `?api=` query parameter in window.location.search (persists to sessionStorage)
 * 2. Validated value in sessionStorage
 * 3. Configured compile-time `VITE_API_BASE_URL` or fallback '/api'
 */
export function getApiBaseUrl(): string {
  // 1. Try URL query parameter (?api=...)
  if (typeof window !== 'undefined' && window.location?.search) {
    try {
      const params = new URLSearchParams(window.location.search);
      const queryParamUrl = params.get('api');
      if (queryParamUrl) {
        const validated = validateApiUrl(queryParamUrl);
        if (validated) {
          // If the API URL changed, isolate credentials: clear token so old credentials are never sent to a new host
          const prevStored = sessionStorage.getItem(API_URL_STORAGE_KEY);
          if (prevStored && prevStored !== validated) {
            setToken(null);
          }
          sessionStorage.setItem(API_URL_STORAGE_KEY, validated);
          return validated;
        }
      }
    } catch {
      // Ignore URL parsing errors and fall through
    }
  }

  // 2. Try validated sessionStorage
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const stored = sessionStorage.getItem(API_URL_STORAGE_KEY);
      if (stored) {
        const validatedStored = validateApiUrl(stored);
        if (validatedStored) {
          return validatedStored;
        } else {
          // Discard invalid / tampered stored value
          sessionStorage.removeItem(API_URL_STORAGE_KEY);
        }
      }
    } catch {
      // Ignore storage errors and fall through
    }
  }

  // 3. Fallback to configured default or '/api'
  const defaultUrl = import.meta.env?.VITE_API_BASE_URL || '/api';
  return defaultUrl.replace(/\/+$/, '');
}

/**
 * Explicitly initializes and captures the active API base URL into sessionStorage.
 */
export function initApiBaseUrl(): string {
  return getApiBaseUrl();
}

// Eagerly initialize active API base URL upon module load if in browser
if (typeof window !== 'undefined') {
  getApiBaseUrl();
}

export const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export class ApiError extends Error {
  code: string;
  category: string;
  requestId: string;
  details?: any;
  retryable: boolean;

  constructor(
    code: string,
    category: string,
    message: string,
    requestId: string,
    retryable: boolean = false,
    details?: any
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.category = category;
    this.requestId = requestId;
    this.retryable = retryable;
    this.details = details;
  }
}

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token);
  } else {
    sessionStorage.removeItem(TOKEN_KEY);
  }
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data: T; meta?: any }> {
  const token = getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const baseUrl = getApiBaseUrl();
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

  try {
    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      setToken(null);
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }

    const body = await res.json();

    if (!res.ok) {
      const errRes = body as ApiErrorResponse;
      if (errRes.error) {
        throw new ApiError(
          errRes.error.code,
          errRes.error.category,
          errRes.error.message,
          errRes.error.requestId,
          errRes.error.retryable,
          errRes.error.details
        );
      }
      throw new ApiError(
        'UNKNOWN_ERROR',
        'internal',
        res.statusText || 'An unexpected error occurred',
        'req_unknown',
        false
      );
    }

    return body;
  } catch (err: any) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError(
      'NETWORK_ERROR',
      'dependency',
      err.message || 'Failed to connect to backend service',
      'req_network',
      true
    );
  }
}
