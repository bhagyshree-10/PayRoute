import { generateTransactionId } from '../../infra/ids.js';
import { computeRequestHash } from '../idempotency/hash.js';
import { IdempotencyService } from '../idempotency/service.js';
import { TransactionRepository } from './repository.js';
import { PaymentAttemptRepository } from '../attempts/repository.js';
import { TransactionStateMachine } from '../transactions/stateMachine.js';
import { enqueuePaymentAttemptJob, getPaymentsQueue } from '../../infra/queues.js';
import { RetryJobsRepository } from '../retry/retryJobs.repository.js';
import {
  ConflictError,
  DependencyError,
  DuplicateRequestError,
  NotFoundError,
  ValidationError
} from '../../middleware/errorHandler.js';
import { GatewayName, PaymentCreateInput, Transaction } from '@payroute/shared';
import { logger } from '../../infra/logger.js';

export class PaymentServiceClass {
  async create(
    clientId: string,
    input: PaymentCreateInput,
    idempotencyKey: string,
    requestId: string
  ): Promise<{ response: { status: number; body: any }; isReplay: boolean }> {
    const now = new Date();
    const requestHash = computeRequestHash(input);
    const newTxnId = generateTransactionId();

    // 1. Idempotency Begin
    const idemResult = await IdempotencyService.begin(clientId, idempotencyKey, requestHash, newTxnId);

    if (idemResult.type === 'REPLAY') {
      return { response: idemResult.response, isReplay: true };
    }

    if (idemResult.type === 'CONFLICT') {
      throw new DuplicateRequestError(
        'IDEMPOTENCY_KEY_REUSED',
        'This Idempotency-Key was already used with a different request body.',
        422,
        false
      );
    }

    if (idemResult.type === 'IN_PROGRESS') {
      throw new DuplicateRequestError(
        'REQUEST_IN_PROGRESS',
        'A request with this Idempotency-Key is currently being processed.',
        409,
        true
      );
    }

    const actualTxnId = idemResult.type === 'RESUME' ? idemResult.transactionId : newTxnId;

    // 2. Create Transaction document if NEW
    if (idemResult.type === 'NEW') {
      const newTxn: Transaction = {
        id: actualTxnId,
        clientId,
        amount: input.amount,
        currency: input.currency.toLowerCase() as any,
        status: 'CREATED',
        description: input.description,
        customer: input.customer,
        metadata: input.metadata || {},
        idempotencyKey,
        requestHash,
        paymentMethodType: 'test_token',
        routing: {
          preferredGateway: (input.preferredGateway as GatewayName) || null,
          exhaustedGateways: [],
          currentGateway: null,
          gatewayGenerations: { stripe: 1, razorpay: 1 },
        },
        attemptCount: 0,
        retryCount: 0,
        finalGateway: null,
        gatewayReference: null,
        failure: null,
        flags: [],
        timeline: [
          {
            at: now,
            type: 'transaction.created',
            detail: { amount: input.amount, currency: input.currency, preferredGateway: input.preferredGateway },
          },
        ],
        version: 1,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      };

      await TransactionRepository.insert(newTxn);
    }

    // 3. Enqueue BullMQ Payment Attempt Job (<txnId>-a1)
    const jobId = `${actualTxnId}-a1`;
    try {
      await enqueuePaymentAttemptJob(
        { transactionId: actualTxnId, attemptNumber: 1 },
        { jobId, delay: 0 }
      );
    } catch (enqueueErr: any) {
      // Infrastructure failure rule: release idempotency key and cancel transaction with 503
      logger.error({ enqueueErr, actualTxnId }, 'Failed to enqueue payment attempt job in BullMQ/Redis');
      await TransactionStateMachine.transition(
        actualTxnId,
        'CANCELLED',
        { failure: { code: 'QUEUE_UNAVAILABLE', message: 'Redis queue is unavailable', gateway: null } },
        { at: new Date(), type: 'transaction.cancelled', detail: { reason: 'QUEUE_UNAVAILABLE' } }
      ).catch(() => {});

      await IdempotencyService.release(clientId, idempotencyKey);
      throw new DependencyError('QUEUE_UNAVAILABLE', 'Redis queue is temporarily unavailable. Please retry.');
    }

    const responseSnapshot = {
      status: 202,
      body: {
        data: {
          id: actualTxnId,
          status: 'CREATED',
          amount: input.amount,
          currency: input.currency.toLowerCase(),
          createdAt: now.toISOString(),
        },
        meta: {
          requestId,
        },
      },
    };

    // 4. Complete Idempotency record with 202 snapshot
    await IdempotencyService.complete(clientId, idempotencyKey, responseSnapshot);

    return { response: responseSnapshot, isReplay: false };
  }

  async get(id: string, callerClientId?: string, isAdmin: boolean = false): Promise<any> {
    const txn = await TransactionRepository.findById(id);

    if (!txn) {
      throw new NotFoundError('PAYMENT_NOT_FOUND', `Payment transaction ${id} not found`);
    }

    if (!isAdmin && callerClientId && txn.clientId !== callerClientId) {
      // Scope protection: return 404 to avoid leaking existence
      throw new NotFoundError('PAYMENT_NOT_FOUND', `Payment transaction ${id} not found`);
    }

    const attempts = await PaymentAttemptRepository.findByTransactionId(id);

    if (!isAdmin) {
      // Client callers get sanitized DTO
      return {
        id: txn.id,
        status: txn.status,
        amount: txn.amount,
        currency: txn.currency,
        description: txn.description,
        customer: txn.customer,
        metadata: txn.metadata,
        finalGateway: txn.finalGateway,
        failure: txn.failure,
        attempts: attempts.map((a) => ({
          attemptNumber: a.attemptNumber,
          gateway: a.gateway,
          status: a.status,
          errorKind: a.error?.kind,
          latencyMs: a.latencyMs,
          startedAt: a.startedAt,
        })),
        createdAt: txn.createdAt,
        updatedAt: txn.updatedAt,
        completedAt: txn.completedAt,
      };
    }

    // Admin callers get full object
    return {
      transaction: txn,
      attempts,
    };
  }

  async cancel(id: string, callerClientId?: string, isAdmin: boolean = false): Promise<Transaction> {
    const txn = await TransactionRepository.findById(id);

    if (!txn) {
      throw new NotFoundError('PAYMENT_NOT_FOUND', `Payment transaction ${id} not found`);
    }

    if (!isAdmin && callerClientId && txn.clientId !== callerClientId) {
      throw new NotFoundError('PAYMENT_NOT_FOUND', `Payment transaction ${id} not found`);
    }

    if (txn.status === 'CANCELLED') {
      return txn;
    }

    if (txn.status !== 'CREATED' && txn.status !== 'RETRYING') {
      throw new ConflictError(
        'INVALID_STATE_TRANSITION',
        `Cannot cancel payment in state ${txn.status}. Only CREATED or RETRYING payments can be cancelled.`
      );
    }

    const now = new Date();
    const updatedTxn = await TransactionStateMachine.transition(
      id,
      'CANCELLED',
      {
        completedAt: now,
      },
      {
        at: now,
        type: 'transaction.cancelled',
        detail: { by: isAdmin ? 'admin' : 'client' },
      }
    );

    // Remove pending job from BullMQ queue if possible
    try {
      const queue = getPaymentsQueue();
      const jobs = await queue.getJobs(['delayed', 'waiting']);
      for (const job of jobs) {
        if (job.data?.transactionId === id) {
          await job.remove();
        }
      }
    } catch (err) {
      logger.warn({ err, id }, 'Could not remove BullMQ job on cancel; worker check will handle active job safely');
    }

    // Mark matching retryJobs as CANCELLED
    const retryJobs = await RetryJobsRepository.findByTransactionId(id);
    for (const rj of retryJobs) {
      if (rj.status === 'SCHEDULED' || rj.status === 'ACTIVE') {
        await RetryJobsRepository.updateStatus(rj.queueJobId, 'CANCELLED', { finishedAt: now });
      }
    }

    return updatedTxn;
  }
}

export const PaymentService = new PaymentServiceClass();
