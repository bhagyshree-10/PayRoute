import { describe, it, expect, vi } from 'vitest';
import { IdempotencyService } from '../../modules/idempotency/service.js';
import { IdempotencyRepository } from '../../modules/idempotency/repository.js';

describe('T02/T03 - Idempotency Service Behavior Unit Tests', () => {
  const clientId = 'usr_test_client_001';
  const key = 'idem_key_abc12345';
  const requestHash = 'sha256_hash_1111';
  const txnId = 'tx_01H8X700000000000000000001';

  it('returns NEW on fresh idempotency key insertion', async () => {
    vi.spyOn(IdempotencyRepository, 'insert').mockResolvedValueOnce(undefined as any);

    const result = await IdempotencyService.begin(clientId, key, requestHash, txnId);
    expect(result.type).toBe('NEW');
    if (result.type === 'NEW') {
      expect(result.transactionId).toBe(txnId);
    }
  });

  it('returns REPLAY when key already completed with identical request hash', async () => {
    const duplicateErr = new Error('E11000 duplicate key');
    (duplicateErr as any).code = 11000;
    vi.spyOn(IdempotencyRepository, 'insert').mockRejectedValueOnce(duplicateErr);

    vi.spyOn(IdempotencyRepository, 'find').mockResolvedValueOnce({
      _id: 'idm_1',
      clientId,
      key,
      requestHash,
      status: 'COMPLETED',
      transactionId: txnId,
      response: { status: 202, body: { data: { id: txnId, status: 'CREATED' } } },
      lockedAt: new Date(),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    });

    const result = await IdempotencyService.begin(clientId, key, requestHash, txnId);
    expect(result.type).toBe('REPLAY');
    if (result.type === 'REPLAY') {
      expect(result.response.status).toBe(202);
      expect(result.response.body.data.id).toBe(txnId);
    }
  });

  it('returns CONFLICT when same key is reused with a different request hash', async () => {
    const duplicateErr = new Error('E11000 duplicate key');
    (duplicateErr as any).code = 11000;
    vi.spyOn(IdempotencyRepository, 'insert').mockRejectedValueOnce(duplicateErr);

    vi.spyOn(IdempotencyRepository, 'find').mockResolvedValueOnce({
      _id: 'idm_1',
      clientId,
      key,
      requestHash: 'different_request_hash_2222',
      status: 'COMPLETED',
      transactionId: txnId,
      response: { status: 202, body: {} },
      lockedAt: new Date(),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    });

    const result = await IdempotencyService.begin(clientId, key, requestHash, txnId);
    expect(result.type).toBe('CONFLICT');
  });

  it('returns IN_PROGRESS when request is currently locked and in flight', async () => {
    const duplicateErr = new Error('E11000 duplicate key');
    (duplicateErr as any).code = 11000;
    vi.spyOn(IdempotencyRepository, 'insert').mockRejectedValueOnce(duplicateErr);

    vi.spyOn(IdempotencyRepository, 'find').mockResolvedValueOnce({
      _id: 'idm_1',
      clientId,
      key,
      requestHash,
      status: 'IN_PROGRESS',
      transactionId: txnId,
      response: null,
      lockedAt: new Date(), // fresh lock (<30s)
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    });

    const result = await IdempotencyService.begin(clientId, key, requestHash, txnId);
    expect(result.type).toBe('IN_PROGRESS');
  });
});
