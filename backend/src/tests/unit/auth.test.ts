import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey } from '../../modules/auth/apiKey.js';
import { signAdminToken, verifyAdminToken } from '../../modules/auth/jwt.js';

describe('T11 - Authentication & Security Unit Tests', () => {
  it('generates test-mode API key with pr_test_ prefix and matching sha256 hash', () => {
    const { rawKey, keyHash, keyPrefix } = generateApiKey();

    expect(rawKey.startsWith('pr_test_')).toBe(true);
    expect(keyPrefix.startsWith('pr_test_')).toBe(true);
    expect(keyHash).toBe(hashApiKey(rawKey));
    expect(keyHash).toHaveLength(64); // sha256 hex
  });

  it('signs and verifies admin JWT tokens with admin role enforcement', () => {
    const payload = {
      sub: 'usr_01H8X700000000000000000000',
      email: 'admin@example.com',
      name: 'PayRoute Admin',
    };

    const { token, expiresAt } = signAdminToken(payload);
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());

    const verified = verifyAdminToken(token);
    expect(verified.sub).toBe(payload.sub);
    expect(verified.email).toBe(payload.email);
    expect(verified.role).toBe('admin');
  });

  it('rejects tampered or malformed JWT tokens', () => {
    expect(() => verifyAdminToken('invalid.jwt.token')).toThrow();
  });
});
