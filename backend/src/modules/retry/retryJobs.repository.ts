import { collections } from '../../infra/mongo.js';
import { RetryJobRecord } from '@payroute/shared';

export const RetryJobsRepository = {
  async insert(record: RetryJobRecord): Promise<RetryJobRecord> {
    await collections.retryJobs().updateOne(
      { queueJobId: record.queueJobId },
      { $set: record },
      { upsert: true }
    );
    return record;
  },

  async updateStatus(queueJobId: string, status: RetryJobRecord['status'], patch: Partial<RetryJobRecord> = {}): Promise<void> {
    await collections.retryJobs().updateOne(
      { queueJobId },
      { $set: { status, ...patch } }
    );
  },

  async findByTransactionId(transactionId: string): Promise<RetryJobRecord[]> {
    return collections.retryJobs().find({ transactionId }).sort({ createdAt: 1 }).toArray();
  }
};
