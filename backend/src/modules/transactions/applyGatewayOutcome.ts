import { collections } from '../../infra/mongo.js';
import { TransactionStateMachine } from './stateMachine.js';
import { TransactionRepository } from '../payments/repository.js';
import { PaymentAttemptRepository } from '../attempts/repository.js';
import { GatewayName, PaymentAttempt, Transaction } from '@payroute/shared';
import { logger } from '../../infra/logger.js';

export interface OutcomeInput {
  type: 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'UNSUPPORTED';
  gatewayReference: string;
  transactionIdHint?: string | null;
  failureCode?: string;
  source: 'WEBHOOK' | 'RECONCILIATION';
}

export async function applyGatewayOutcome(
  matchedAttempt: PaymentAttempt | null,
  normalized: OutcomeInput
): Promise<{ transactionId: string; status: string; matched: boolean }> {
  const now = new Date();

  // Find transaction
  let txnId = matchedAttempt?.transactionId || normalized.transactionIdHint;
  let txn: Transaction | null = null;

  if (txnId) {
    txn = await TransactionRepository.findById(txnId);
  }

  if (!txn && matchedAttempt) {
    txn = await TransactionRepository.findById(matchedAttempt.transactionId);
  }

  if (!txn) {
    return { transactionId: txnId || 'unknown', status: 'UNMATCHED', matched: false };
  }

  txnId = txn.id;

  // 1. Update matching attempt record if present
  if (matchedAttempt) {
    const isTerminalAttempt = matchedAttempt.status === 'SUCCEEDED' || matchedAttempt.status === 'FAILED';
    const targetStatus = normalized.type === 'SUCCEEDED' ? 'SUCCEEDED' : 'FAILED';
    const attemptStatus = matchedAttempt.status === 'SUCCEEDED' ? 'SUCCEEDED' : targetStatus;

    const patch: Partial<PaymentAttempt> = {
      status: attemptStatus,
      gatewayReference: normalized.gatewayReference || matchedAttempt.gatewayReference,
    };

    // Preserve existing finishedAt for already-terminal attempt;
    // only populate it if missing and transition is valid, or when transitioning a non-terminal attempt.
    if (isTerminalAttempt && matchedAttempt.finishedAt) {
      // Keep existing finishedAt intact - do not overwrite
    } else {
      patch.finishedAt = now;
    }

    await PaymentAttemptRepository.update(matchedAttempt.id, patch);
  }

  // 2. Apply rules to Transaction state
  if (normalized.type === 'SUCCEEDED') {
    if (txn.status === 'SUCCESS') {
      // Check if success came from a different attempt
      if (txn.gatewayReference && txn.gatewayReference !== normalized.gatewayReference) {
        logger.warn(
          { txnId, existingRef: txn.gatewayReference, newRef: normalized.gatewayReference },
          'Duplicate charge suspected from different gateway attempt'
        );
        await collections.transactions().updateOne(
          { $or: [{ id: txnId }, { _id: txnId }] },
          { $addToSet: { flags: 'DUPLICATE_CHARGE_SUSPECTED' } }
        );
      }
      return { transactionId: txnId, status: 'SUCCESS', matched: true };
    }

    const isLateSuccess = txn.status === 'FAILED' || txn.status === 'CANCELLED';
    const flagsToSet = isLateSuccess ? [...(txn.flags || []), 'LATE_SUCCESS'] : (txn.flags || []);

    const eventType = normalized.source === 'RECONCILIATION'
      ? (isLateSuccess ? 'reconciliation.late_success' : 'reconciliation.succeeded')
      : (isLateSuccess ? 'webhook.late_success' : 'webhook.succeeded');

    const updatedTxn = await TransactionStateMachine.transition(
      txnId,
      'SUCCESS',
      {
        finalGateway: (matchedAttempt?.gateway || txn.routing.currentGateway || 'stripe') as GatewayName,
        gatewayReference: normalized.gatewayReference,
        completedAt: now,
        flags: flagsToSet as any,
      },
      {
        at: now,
        type: eventType,
        detail: {
          gatewayReference: normalized.gatewayReference,
          source: normalized.source,
          flag: isLateSuccess ? 'LATE_SUCCESS' : undefined,
        },
      }
    );

    return { transactionId: txnId, status: updatedTxn.status, matched: true };
  } else if (normalized.type === 'FAILED' || normalized.type === 'CANCELED') {
    if (txn.status === 'AWAITING_CONFIRMATION') {
      const failureCode = normalized.failureCode || 'GATEWAY_REPORTED_FAILURE';
      const eventType = normalized.source === 'RECONCILIATION'
        ? 'reconciliation.failed'
        : 'webhook.failed';

      const updatedTxn = await TransactionStateMachine.transition(
        txnId,
        'FAILED',
        {
          failure: {
            code: failureCode,
            message: `Gateway reported payment ${normalized.type.toLowerCase()}`,
            gateway: matchedAttempt?.gateway || null,
          },
          completedAt: now,
        },
        {
          at: now,
          type: eventType,
          detail: { failureCode, source: normalized.source },
        }
      );
      return { transactionId: txnId, status: updatedTxn.status, matched: true };
    }
  }

  return { transactionId: txnId, status: txn.status, matched: true };
}
