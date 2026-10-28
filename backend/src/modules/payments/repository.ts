import { collections } from '../../infra/mongo.js';
import { Transaction } from '@payroute/shared';

export const TransactionRepository = {
  async insert(txn: Transaction): Promise<Transaction> {
    await collections.transactions().insertOne(txn as any);
    return txn;
  },

  async findById(id: string): Promise<Transaction | null> {
    return collections.transactions().findOne({ $or: [{ id }, { _id: id }] });
  },

  async findByClientId(clientId: string, limit: number = 25, cursor?: string): Promise<Transaction[]> {
    const filter: any = { clientId };
    if (cursor) {
      filter.$or = [{ id: { $lt: cursor } }, { _id: { $lt: cursor } }];
    }
    return collections.transactions().find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).toArray();
  },

  async update(id: string, patch: Partial<Transaction>): Promise<void> {
    await collections.transactions().updateOne({ $or: [{ id }, { _id: id }] }, { $set: patch as any });
  }
};
