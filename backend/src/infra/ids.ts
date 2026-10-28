import { ulid } from 'ulid';

export function generateId(prefix: string): string {
  return `${prefix}_${ulid()}`;
}

export function generateUserId(): string {
  return generateId('usr');
}

export function generateTransactionId(): string {
  return generateId('txn');
}

export function generateAttemptId(): string {
  return generateId('att');
}

export function generateWebhookEventId(): string {
  return generateId('whe');
}

export function generateIdempotencyKeyId(): string {
  return generateId('idem');
}

export function generateRetryJobId(): string {
  return generateId('rj');
}

export function generateRequestId(): string {
  return generateId('req');
}
