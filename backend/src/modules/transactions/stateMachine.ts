import { collections } from '../../infra/mongo.js';
import { TimelineEvent, Transaction, TransactionStatus } from '@payroute/shared';
import { AppError } from '../../middleware/errorHandler.js';

export class InvalidTransitionError extends AppError {
  constructor(txnId: string, to: TransactionStatus) {
    super(
      'INVALID_STATE_TRANSITION',
      'conflict',
      `Cannot transition transaction ${txnId} to state ${to}`,
      409,
      false
    );
  }
}

const ALLOWED_FROM: Record<TransactionStatus, TransactionStatus[]> = {
  CREATED: [],
  PROCESSING: ['CREATED', 'RETRYING'],
  RETRYING: ['PROCESSING'],
  AWAITING_CONFIRMATION: ['PROCESSING'],
  SUCCESS: ['AWAITING_CONFIRMATION', 'PROCESSING', 'RETRYING', 'FAILED', 'CANCELLED'],
  FAILED: ['PROCESSING', 'AWAITING_CONFIRMATION'],
  CANCELLED: ['CREATED', 'RETRYING'],
};

export class TransactionStateMachineClass {
  async transition(
    txnId: string,
    to: TransactionStatus,
    patch: Partial<Transaction> = {},
    event?: TimelineEvent
  ): Promise<Transaction> {
    const now = new Date();
    const allowed = ALLOWED_FROM[to] || [];

    const updateDoc: any = {
      $set: { status: to, updatedAt: now, ...patch },
      $inc: { version: 1 }
    };

    if (event) {
      updateDoc.$push = { timeline: { $each: [event], $slice: -50 } };
    }

    const res = await collections.transactions().findOneAndUpdate(
      { $or: [{ id: txnId }, { _id: txnId }], status: { $in: allowed } },
      updateDoc,
      { returnDocument: 'after' }
    );

    if (!res) {
      throw new InvalidTransitionError(txnId, to);
    }

    return res as unknown as Transaction;
  }
}

export const TransactionStateMachine = new TransactionStateMachineClass();
