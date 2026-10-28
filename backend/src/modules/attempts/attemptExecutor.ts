import { collections } from '../../infra/mongo.js';
import { generateAttemptId, generateRetryJobId } from '../../infra/ids.js';
import { Router } from '../routing/router.js';
import { CircuitBreaker } from '../circuit-breaker/circuitBreaker.js';
import { GatewayRegistry } from '../gateways/registry.js';
import { GatewayError } from '../gateways/types.js';
import { RetryPolicy } from '../retry/policy.js';
import { PaymentAttemptRepository } from './repository.js';
import { RetryJobsRepository } from '../retry/retryJobs.repository.js';
import { TransactionRepository } from '../payments/repository.js';
import { TransactionStateMachine } from '../transactions/stateMachine.js';
import { env } from '../../config/env.js';
import { logger } from '../../infra/logger.js';
import { GatewayName, PaymentAttempt, Transaction } from '@payroute/shared';
import { enqueuePaymentAttemptJob, enqueueRoutingWaitJob } from '../../infra/queues.js';

export class AttemptExecutorClass {
  async runJob(jobData: { transactionId: string; attemptNumber: number }): Promise<void> {
    const { transactionId, attemptNumber } = jobData;
    const now = new Date();

    // 1. Load transaction
    const tx = await TransactionRepository.findById(transactionId);
    if (!tx) {
      logger.error({ transactionId }, 'AttemptExecutor failed: transaction not found');
      throw new Error(`Transaction ${transactionId} not found`);
    }

    if (tx.status !== 'CREATED' && tx.status !== 'RETRYING') {
      logger.info(
        { transactionId, status: tx.status },
        'AttemptExecutor skipped: transaction already finished or in-flight'
      );
      return;
    }

    // 2. Guarded transition tx -> PROCESSING
    let currentTx: Transaction;
    try {
      currentTx = await TransactionStateMachine.transition(
        transactionId,
        'PROCESSING',
        {
          attemptCount: (tx.attemptCount || 0) + 1,
          updatedAt: now,
        },
        { at: now, type: 'worker.claim', detail: { attemptNumber } }
      );
    } catch {
      logger.info({ transactionId }, 'AttemptExecutor skipped: compare-and-swap transition to PROCESSING failed');
      return;
    }

    // 3. Router selection
    const decision = await Router.select(currentTx);

    if (!decision.selected || decision.reason === 'NONE_AVAILABLE') {
      await this.handleNoGatewayAvailable(currentTx, attemptNumber);
      return;
    }

    const selectedGateway = decision.selected;

    // 4. Calculate gateway generation for idempotency key
    const currentGenerations = currentTx.routing?.gatewayGenerations || { stripe: 1, razorpay: 1 };
    const gen = currentGenerations[selectedGateway] || 1;
    const gatewayIdempotencyKey = `pr_${transactionId}_${selectedGateway}_g${gen}`;

    // 5. Insert PaymentAttempt with STARTED status
    const attemptId = generateAttemptId();
    const permit = await CircuitBreaker.acquire(selectedGateway);

    const newAttempt: PaymentAttempt = {
      id: attemptId,
      transactionId,
      attemptNumber,
      gateway: selectedGateway,
      status: 'STARTED',
      gatewayIdempotencyKey,
      gatewayReference: null,
      routingDecision: decision,
      isProbe: permit.isProbe,
      error: null,
      latencyMs: null,
      startedAt: now,
      finishedAt: null,
      createdAt: now,
    };

    await PaymentAttemptRepository.insert(newAttempt);

    if (!permit.allowed) {
      // Breaker denied (or probe busy)
      logger.warn({ transactionId, gateway: selectedGateway, reason: permit.reason }, 'Circuit breaker denied execution permit');
    }

    // 6. Execute Gateway Payment Attempt
    const gatewayAdapter = GatewayRegistry.getGateway(selectedGateway);
    const t0 = Date.now();

    try {
      const result = await gatewayAdapter.createPayment(
        {
          amount: currentTx.amount,
          currency: currentTx.currency,
          customerReference: currentTx.customer.reference,
          paymentMethodToken: currentTx.paymentMethodType === 'test_token' ? 'pm_card_visa' : undefined,
          metadata: currentTx.metadata,
        },
        {
          gatewayIdempotencyKey,
          timeoutMs: env.GATEWAY_TIMEOUT_MS,
          transactionId,
          correlationAttemptId: attemptId,
        }
      );

      const latencyMs = Date.now() - t0;

      // Update attempt -> ACCEPTED
      await PaymentAttemptRepository.update(attemptId, {
        status: 'ACCEPTED',
        gatewayReference: result.gatewayReference,
        latencyMs,
        finishedAt: new Date(),
      });

      // Circuit Breaker record success
      await CircuitBreaker.recordSuccess(selectedGateway);

      // Transition tx -> AWAITING_CONFIRMATION
      await TransactionStateMachine.transition(
        transactionId,
        'AWAITING_CONFIRMATION',
        {
          finalGateway: selectedGateway,
          gatewayReference: result.gatewayReference,
          routing: {
            ...currentTx.routing,
            currentGateway: selectedGateway,
          },
        },
        {
          at: new Date(),
          type: 'payment.accepted',
          detail: { gateway: selectedGateway, gatewayReference: result.gatewayReference, latencyMs },
        }
      );

      logger.info(
        { transactionId, attemptId, gateway: selectedGateway, ref: result.gatewayReference, latencyMs },
        'Gateway accepted payment call; transaction now awaiting webhook confirmation'
      );
    } catch (err: any) {
      const latencyMs = Date.now() - t0;
      const gwErr: GatewayError =
        err instanceof GatewayError
          ? err
          : new GatewayError({
              kind: 'UNKNOWN',
              retryClass: 'TERMINAL',
              message: err.message || 'Unknown execution error',
              countsAgainstBreaker: false,
            });

      // Update attempt -> FAILED
      await PaymentAttemptRepository.update(attemptId, {
        status: 'FAILED',
        error: {
          kind: gwErr.kind,
          retryClass: gwErr.retryClass,
          ambiguous: gwErr.ambiguous,
          httpStatus: gwErr.httpStatus,
          gatewayCode: gwErr.gatewayCode,
          message: gwErr.message,
        },
        latencyMs,
        finishedAt: new Date(),
      });

      // Circuit Breaker record failure or success
      if (gwErr.countsAgainstBreaker) {
        await CircuitBreaker.recordFailure(selectedGateway, gwErr.kind);
      } else {
        await CircuitBreaker.recordSuccess(selectedGateway);
      }

      // Update gateway generations: increment only after definite failure (non-ambiguous)
      const nextGenerations = { ...currentGenerations };
      if (!gwErr.ambiguous) {
        nextGenerations[selectedGateway] = (nextGenerations[selectedGateway] || 1) + 1;
      }

      // 7. Calculate Retry Plan
      const plan = await RetryPolicy.next(currentTx, newAttempt, gwErr);

      if (plan.type === 'RETRY_SAME') {
        const nextAttemptNum = attemptNumber + 1;
        const queueJobId = `${transactionId}-a${nextAttemptNum}`;
        const scheduledFor = new Date(Date.now() + plan.delayMs);

        await TransactionStateMachine.transition(
          transactionId,
          'RETRYING',
          {
            retryCount: currentTx.retryCount + 1,
            routing: {
              ...currentTx.routing,
              gatewayGenerations: nextGenerations,
            },
          },
          {
            at: new Date(),
            type: 'payment.retry_scheduled',
            detail: { attemptNumber: nextAttemptNum, gateway: plan.gateway, delayMs: plan.delayMs },
          }
        );

        await RetryJobsRepository.insert({
          id: generateRetryJobId(),
          queueJobId,
          transactionId,
          type: 'PAYMENT_RETRY',
          attemptNumber: nextAttemptNum,
          gateway: plan.gateway,
          status: 'SCHEDULED',
          reason: gwErr.kind,
          delayMs: plan.delayMs,
          scheduledFor,
          createdAt: new Date(),
        });

        await enqueuePaymentAttemptJob(
          { transactionId, attemptNumber: nextAttemptNum },
          { jobId: queueJobId, delay: plan.delayMs }
        );

        logger.info(
          { transactionId, nextAttemptNum, gateway: plan.gateway, delayMs: plan.delayMs },
          'Scheduled payment retry job'
        );
      } else if (plan.type === 'FALLBACK') {
        const nextAttemptNum = attemptNumber + 1;
        const queueJobId = `${transactionId}-a${nextAttemptNum}`;
        const exhausted = Array.from(new Set([...(currentTx.routing?.exhaustedGateways || []), selectedGateway]));

        await TransactionStateMachine.transition(
          transactionId,
          'RETRYING',
          {
            retryCount: currentTx.retryCount + 1,
            routing: {
              ...currentTx.routing,
              exhaustedGateways: exhausted,
              gatewayGenerations: nextGenerations,
            },
          },
          {
            at: new Date(),
            type: 'payment.fallback',
            detail: { from: selectedGateway, to: plan.fallbackGateway, reason: gwErr.kind },
          }
        );

        await RetryJobsRepository.insert({
          id: generateRetryJobId(),
          queueJobId,
          transactionId,
          type: 'FALLBACK',
          attemptNumber: nextAttemptNum,
          gateway: plan.fallbackGateway || null,
          status: 'SCHEDULED',
          reason: 'FALLBACK_AFTER_EXHAUSTION',
          delayMs: 0,
          scheduledFor: new Date(),
          createdAt: new Date(),
        });

        await enqueuePaymentAttemptJob(
          { transactionId, attemptNumber: nextAttemptNum },
          { jobId: queueJobId, delay: 0 }
        );

        logger.warn(
          { transactionId, from: selectedGateway, to: plan.fallbackGateway },
          'Exhausted gateway retries; falling back to secondary gateway'
        );
      } else {
        // FAIL
        await TransactionStateMachine.transition(
          transactionId,
          'FAILED',
          {
            failure: {
              code: plan.failureCode,
              message: plan.failureMessage,
              gateway: selectedGateway,
            },
            completedAt: new Date(),
          },
          {
            at: new Date(),
            type: 'transaction.failed',
            detail: { code: plan.failureCode, message: plan.failureMessage },
          }
        );

        logger.error(
          { transactionId, code: plan.failureCode, message: plan.failureMessage },
          'Transaction failed permanently'
        );
      }
    }
  }

  private async handleNoGatewayAvailable(tx: Transaction, attemptNumber: number): Promise<void> {
    const now = new Date();
    const waitCount = (tx.timeline?.filter((t) => t.type === 'routing.wait').length || 0) + 1;

    if (waitCount > 3) {
      await TransactionStateMachine.transition(
        tx.id,
        'FAILED',
        {
          failure: {
            code: 'NO_GATEWAY_AVAILABLE',
            message: 'Router found no usable gateway after 3 routing waits',
            gateway: null,
          },
          completedAt: now,
        },
        {
          at: now,
          type: 'transaction.failed',
          detail: { code: 'NO_GATEWAY_AVAILABLE' },
        }
      );
      return;
    }

    const delayMs = 10000; // 10s wait delay
    const queueJobId = `${tx.id}-w${waitCount}`;

    await TransactionStateMachine.transition(
      tx.id,
      'RETRYING',
      {},
      {
        at: now,
        type: 'routing.wait',
        detail: { waitCount, delayMs },
      }
    );

    await RetryJobsRepository.insert({
      id: generateRetryJobId(),
      queueJobId,
      transactionId: tx.id,
      type: 'ROUTING_WAIT',
      attemptNumber,
      gateway: null,
      status: 'SCHEDULED',
      reason: 'NONE_AVAILABLE',
      delayMs,
      scheduledFor: new Date(now.getTime() + delayMs),
      createdAt: now,
    });

    await enqueueRoutingWaitJob(
      { transactionId: tx.id, waitCount },
      { jobId: queueJobId, delay: delayMs }
    );
  }
}

export const AttemptExecutor = new AttemptExecutorClass();
