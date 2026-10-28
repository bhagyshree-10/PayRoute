import crypto from 'crypto';

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
  // Key format: pr_test_<32 random base64url bytes>
  const randomBytes = crypto.randomBytes(32).toString('base64url');
  const rawKey = `pr_test_${randomBytes}`;
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = rawKey.substring(0, 12);
  return { rawKey, keyHash, keyPrefix };
}
