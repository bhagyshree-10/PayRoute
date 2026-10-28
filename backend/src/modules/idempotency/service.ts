import { generateIdempotencyKeyId } from '../../infra/ids.js';
import { env } from '../../config/env.js';
import { IdempotencyRepository } from './repository.js';
import { IdempotencyRecord } from '../types.js';

export type IdempotencyBeginResult =
  | { type: 'NEW'; transactionId: string }
  | { type: 'REPLAY'; response: { status: number; body: any } }
  | { type: 'IN_PROGRESS' }
  | { type: 'CONFLICT' }
  | { type: 'RESUME'; transactionId: string };

export class IdempotencyServiceClass {
  async begin(
    clientId: string,
    key: string,
    requestHash: string,
    newTxnId: string
  ): Promise<IdempotencyBeginResult> {
    const now = new Date();
    const ttlHours = env.IDEMPOTENCY_TTL_HOURS;
    const expiresAt = new Date(now.getTime() + ttlHours * 3600 * 1000);

    const record: IdempotencyRecord = {
      _id: generateIdempotencyKeyId(),
      clientId,
      key,
      requestHash,
      status: 'IN_PROGRESS',
      transactionId: newTxnId,
      response: null,
      lockedAt: now,
      createdAt: now,
      expiresAt,
    };

    try {
      await IdempotencyRepository.insert(record);
      return { type: 'NEW', transactionId: newTxnId };
    } catch (err: any) {
      if (err.code !== 11000) {
        throw err;
      }

      // Duplicate key error on (clientId, key)
      const existing = await IdempotencyRepository.find(clientId, key);

      if (!existing) {
        // Expired between calls, retry insert
        await IdempotencyRepository.insert(record);
        return { type: 'NEW', transactionId: newTxnId };
      }

      if (existing.expiresAt && new Date(existing.expiresAt).getTime() < now.getTime()) {
        await IdempotencyRepository.delete(clientId, key);
        await IdempotencyRepository.insert(record);
        return { type: 'NEW', transactionId: newTxnId };
      }

      if (existing.requestHash !== requestHash) {
        return { type: 'CONFLICT' };
      }

      if (existing.status === 'COMPLETED' && existing.response) {
        return { type: 'REPLAY', response: existing.response };
      }

      if (existing.status === 'IN_PROGRESS') {
        const lockedAtMs = new Date(existing.lockedAt).getTime();
        if (now.getTime() - lockedAtMs < 30000) {
          return { type: 'IN_PROGRESS' };
        }

        // Takeover stale lock (>30s)
        const updated = await IdempotencyRepository.takeover(existing._id, existing.lockedAt, now);
        if (updated) {
          return { type: 'RESUME', transactionId: existing.transactionId };
        }
        return { type: 'IN_PROGRESS' };
      }

      return { type: 'IN_PROGRESS' };
    }
  }

  async complete(
    clientId: string,
    key: string,
    response: { status: number; body: Record<string, any> }
  ): Promise<void> {
    await IdempotencyRepository.complete(clientId, key, response);
  }

  async release(clientId: string, key: string): Promise<void> {
    await IdempotencyRepository.delete(clientId, key);
  }
}

export const IdempotencyService = new IdempotencyServiceClass();
