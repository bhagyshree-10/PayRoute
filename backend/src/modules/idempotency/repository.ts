import { collections } from '../../infra/mongo.js';
import { IdempotencyRecord } from '../types.js';

export const IdempotencyRepository = {
  async insert(record: IdempotencyRecord): Promise<void> {
    await collections.idempotencyKeys().insertOne(record);
  },

  async find(clientId: string, key: string): Promise<IdempotencyRecord | null> {
    return collections.idempotencyKeys().findOne({ clientId, key });
  },

  async delete(clientId: string, key: string): Promise<void> {
    await collections.idempotencyKeys().deleteOne({ clientId, key });
  },

  async complete(clientId: string, key: string, response: { status: number; body: Record<string, any> }): Promise<void> {
    await collections.idempotencyKeys().updateOne(
      { clientId, key, status: 'IN_PROGRESS' },
      {
        $set: {
          status: 'COMPLETED',
          response,
          completedAt: new Date(),
        },
      }
    );
  },

  async takeover(id: string, oldLockedAt: Date, newLockedAt: Date): Promise<IdempotencyRecord | null> {
    return collections.idempotencyKeys().findOneAndUpdate(
      { _id: id, status: 'IN_PROGRESS', lockedAt: oldLockedAt },
      { $set: { lockedAt: newLockedAt } },
      { returnDocument: 'after' }
    );
  }
};
