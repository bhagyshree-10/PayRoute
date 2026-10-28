import { collections } from '../../infra/mongo.js';
import { PaymentAttempt } from '@payroute/shared';

export const PaymentAttemptRepository = {
  async insert(attempt: PaymentAttempt): Promise<PaymentAttempt> {
    await collections.paymentAttempts().insertOne(attempt as any);
    return attempt;
  },

  async update(id: string, patch: Partial<PaymentAttempt>): Promise<void> {
    await collections.paymentAttempts().updateOne(
      { $or: [{ id }, { _id: id as any }] },
      { $set: patch as any }
    );
  },

  async findById(id: string): Promise<PaymentAttempt | null> {
    return collections.paymentAttempts().findOne({
      $or: [{ id }, { _id: id as any }]
    });
  },

  async findByTransactionId(transactionId: string): Promise<PaymentAttempt[]> {
    return collections.paymentAttempts().find({ transactionId }).sort({ attemptNumber: 1 }).toArray();
  },

  async findByGatewayRef(gateway: string, gatewayReference: string): Promise<PaymentAttempt | null> {
    return collections.paymentAttempts().findOne({ gateway: gateway as any, gatewayReference });
  }
};
