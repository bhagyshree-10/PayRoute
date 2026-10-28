import { MongoClient, ClientSession } from 'mongodb';
import { connectMongo, collections, getMongoClient, closeMongo } from '../infra/mongo.js';
import { PaymentAttemptRepository } from '../modules/attempts/repository.js';
import { TransactionRepository } from '../modules/payments/repository.js';
import { PaymentAttempt, Transaction } from '@payroute/shared';

export interface RepairTargetSpec {
  txnId: string;
  expectedTxnGatewayRef: string;
  attemptId: string;
  approvedLatencyMs: number;
  approvedFinishedAt: string; // ISO string
}

export const APPROVED_REPAIR_TARGETS: RepairTargetSpec[] = [
  {
    txnId: 'txn_01M5QDYZ9GCPT8RM0BD6N57ZSD',
    expectedTxnGatewayRef: 'pi_3UU8NRF8v6d32i831EjFW6os',
    attemptId: 'att_01M5QDYZNV8ZDS8TAZBSKCCK8V',
    approvedLatencyMs: 1637,
    approvedFinishedAt: '2026-10-24T17:15:18.240Z',
  },
  {
    txnId: 'txn_01M5P252FZPZNH2X7YBP6BXNWE',
    expectedTxnGatewayRef: 'pi_3UTwQUF8v6d32i832h5ovxNc',
    attemptId: 'att_01M5P252R0G7M4GNKJQFZJNRSB',
    approvedLatencyMs: 1312,
    approvedFinishedAt: '2026-10-24T04:29:48.181Z',
  },
];

export interface PreconditionCheckResult {
  valid: boolean;
  errors: string[];
  documents: {
    txns: Record<string, Transaction>;
    attempts: Record<string, PaymentAttempt>;
  };
}

/**
 * Validates that all four target documents exist and strictly match expected preconditions.
 */
export async function validatePreconditions(
  session?: ClientSession
): Promise<PreconditionCheckResult> {
  const errors: string[] = [];
  const txns: Record<string, Transaction> = {};
  const attempts: Record<string, PaymentAttempt> = {};

  for (const target of APPROVED_REPAIR_TARGETS) {
    // 1. Validate Transaction
    const txn = (await collections.transactions().findOne(
      { id: target.txnId },
      { session }
    )) as unknown as Transaction | null;

    if (!txn) {
      errors.push(`Transaction "${target.txnId}" not found in database.`);
      continue;
    }

    txns[target.txnId] = txn;

    if (txn.status !== 'SUCCESS') {
      errors.push(`Transaction "${target.txnId}" status is "${txn.status}", expected "SUCCESS".`);
    }
    if (txn.attemptCount !== 0) {
      errors.push(`Transaction "${target.txnId}" attemptCount is ${txn.attemptCount}, expected 0.`);
    }
    if (txn.retryCount !== 0) {
      errors.push(`Transaction "${target.txnId}" retryCount is ${txn.retryCount}, expected 0.`);
    }
    if (txn.version !== 4) {
      errors.push(`Transaction "${target.txnId}" version is ${txn.version}, expected 4.`);
    }
    if (txn.gatewayReference !== target.expectedTxnGatewayRef) {
      errors.push(
        `Transaction "${target.txnId}" gatewayReference is "${txn.gatewayReference}", expected "${target.expectedTxnGatewayRef}".`
      );
    }

    // 2. Validate PaymentAttempt
    const attempt = (await collections.paymentAttempts().findOne(
      { id: target.attemptId },
      { session }
    )) as unknown as PaymentAttempt | null;

    if (!attempt) {
      errors.push(`PaymentAttempt "${target.attemptId}" not found in database.`);
      continue;
    }

    attempts[target.attemptId] = attempt;

    if (attempt.transactionId !== target.txnId) {
      errors.push(
        `PaymentAttempt "${target.attemptId}" transactionId is "${attempt.transactionId}", expected "${target.txnId}".`
      );
    }
    if (attempt.attemptNumber !== 1) {
      errors.push(`PaymentAttempt "${target.attemptId}" attemptNumber is ${attempt.attemptNumber}, expected 1.`);
    }
    if (attempt.status !== 'STARTED') {
      errors.push(`PaymentAttempt "${target.attemptId}" status is "${attempt.status}", expected "STARTED".`);
    }
    if (attempt.gatewayReference !== null) {
      errors.push(
        `PaymentAttempt "${target.attemptId}" gatewayReference is "${attempt.gatewayReference}", expected null.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    documents: { txns, attempts },
  };
}

/**
 * Generates and prints the proposed dry-run diff for all target documents.
 */
export function generateDryRunPlan(docs: {
  txns: Record<string, Transaction>;
  attempts: Record<string, PaymentAttempt>;
}): void {
  console.log('\n================================================================');
  console.log('DRY-RUN PROPOSED MODIFICATIONS');
  console.log('================================================================');

  for (const target of APPROVED_REPAIR_TARGETS) {
    const txn = docs.txns[target.txnId];
    const attempt = docs.attempts[target.attemptId];

    console.log(`\n--- Target Transaction: ${target.txnId} ---`);
    console.log('Current:');
    console.log(`  id:               ${txn.id}`);
    console.log(`  status:           ${txn.status}`);
    console.log(`  attemptCount:     ${txn.attemptCount} (PROPOSED -> 1)`);
    console.log(`  retryCount:       ${txn.retryCount} (UNCHANGED)`);
    console.log(`  version:          ${txn.version} (UNCHANGED)`);
    console.log(`  gatewayReference: ${txn.gatewayReference} (UNCHANGED)`);

    console.log(`\n--- Target PaymentAttempt: ${target.attemptId} ---`);
    console.log('Current:');
    console.log(`  id:               ${attempt.id}`);
    console.log(`  transactionId:    ${attempt.transactionId} (UNCHANGED)`);
    console.log(`  attemptNumber:    ${attempt.attemptNumber} (UNCHANGED)`);
    console.log(`  status:           ${attempt.status} (PROPOSED -> "SUCCEEDED")`);
    console.log(`  gatewayReference: ${attempt.gatewayReference} (PROPOSED -> "${target.expectedTxnGatewayRef}")`);
    console.log(`  latencyMs:        ${attempt.latencyMs} (PROPOSED -> ${target.approvedLatencyMs})`);
    console.log(`  finishedAt:       ${attempt.finishedAt} (PROPOSED -> "${target.approvedFinishedAt}")`);
  }

  console.log('\nExpected Execution Metrics:');
  console.log('  Total documents to match:    4');
  console.log('  Total documents to modify:   4');
  console.log('  Transactions updated:        2');
  console.log('  PaymentAttempts updated:     2');
}

/**
 * Executes all four updates conditionally in a single MongoDB transaction session.
 */
export async function executeRepairTransaction(
  client: MongoClient
): Promise<{ success: boolean; modifiedCount: number }> {
  const session = client.startSession();
  let modifiedTotal = 0;

  try {
    await session.withTransaction(async () => {
      // 1. Pre-validation within transaction session
      const check = await validatePreconditions(session);
      if (!check.valid) {
        throw new Error(`Precondition validation failed inside transaction:\n${check.errors.join('\n')}`);
      }

      for (const target of APPROVED_REPAIR_TARGETS) {
        // 2. Conditional Update Transaction
        const txnFilter = {
          id: target.txnId,
          status: 'SUCCESS' as const,
          attemptCount: 0,
          retryCount: 0,
          version: 4,
          gatewayReference: target.expectedTxnGatewayRef,
        };

        const txnUpdate = {
          $set: { attemptCount: 1 },
        };

        const txnRes = await collections.transactions().updateOne(txnFilter, txnUpdate, { session });
        if (txnRes.matchedCount !== 1 || txnRes.modifiedCount !== 1) {
          throw new Error(
            `Transaction update condition not met for "${target.txnId}". ` +
              `Matched: ${txnRes.matchedCount}, Modified: ${txnRes.modifiedCount}. Transaction aborting.`
          );
        }
        modifiedTotal += txnRes.modifiedCount;

        // 3. Conditional Update PaymentAttempt
        const attemptFilter = {
          id: target.attemptId,
          transactionId: target.txnId,
          attemptNumber: 1,
          status: 'STARTED' as const,
          gatewayReference: null,
        };

        const attemptUpdate = {
          $set: {
            status: 'SUCCEEDED' as const,
            gatewayReference: target.expectedTxnGatewayRef,
            latencyMs: target.approvedLatencyMs,
            finishedAt: new Date(target.approvedFinishedAt),
          },
        };

        const attRes = await collections.paymentAttempts().updateOne(attemptFilter, attemptUpdate, { session });
        if (attRes.matchedCount !== 1 || attRes.modifiedCount !== 1) {
          throw new Error(
            `PaymentAttempt update condition not met for "${target.attemptId}". ` +
              `Matched: ${attRes.matchedCount}, Modified: ${attRes.modifiedCount}. Transaction aborting.`
          );
        }
        modifiedTotal += attRes.modifiedCount;
      }
    });

    return { success: true, modifiedCount: modifiedTotal };
  } finally {
    await session.endSession();
  }
}

/**
 * Fresh read-only verification of all four documents and repository linkage after commit.
 */
export async function verifyPostConditions(): Promise<{ verified: boolean; issues: string[] }> {
  const issues: string[] = [];

  for (const target of APPROVED_REPAIR_TARGETS) {
    const txn = await TransactionRepository.findById(target.txnId);
    if (!txn) {
      issues.push(`Post-verification failed: Transaction "${target.txnId}" not found.`);
      continue;
    }
    if (txn.attemptCount !== 1) {
      issues.push(`Post-verification failed: Transaction "${target.txnId}" attemptCount is ${txn.attemptCount}, expected 1.`);
    }
    if (txn.status !== 'SUCCESS') {
      issues.push(`Post-verification failed: Transaction "${target.txnId}" status altered to "${txn.status}".`);
    }
    if (txn.version !== 4) {
      issues.push(`Post-verification failed: Transaction "${target.txnId}" version altered to ${txn.version}.`);
    }
    if (txn.retryCount !== 0) {
      issues.push(`Post-verification failed: Transaction "${target.txnId}" retryCount altered to ${txn.retryCount}.`);
    }

    const attempt = await PaymentAttemptRepository.findById(target.attemptId);
    if (!attempt) {
      issues.push(`Post-verification failed: PaymentAttempt "${target.attemptId}" not found.`);
      continue;
    }
    if (attempt.status !== 'SUCCEEDED') {
      issues.push(`Post-verification failed: PaymentAttempt "${target.attemptId}" status is "${attempt.status}", expected "SUCCEEDED".`);
    }
    if (attempt.gatewayReference !== target.expectedTxnGatewayRef) {
      issues.push(
        `Post-verification failed: PaymentAttempt "${target.attemptId}" gatewayReference is "${attempt.gatewayReference}", expected "${target.expectedTxnGatewayRef}".`
      );
    }
    if (attempt.latencyMs !== target.approvedLatencyMs) {
      issues.push(
        `Post-verification failed: PaymentAttempt "${target.attemptId}" latencyMs is ${attempt.latencyMs}, expected ${target.approvedLatencyMs}.`
      );
    }
    if (!attempt.finishedAt || new Date(attempt.finishedAt).toISOString() !== target.approvedFinishedAt) {
      issues.push(
        `Post-verification failed: PaymentAttempt "${target.attemptId}" finishedAt is ${attempt.finishedAt}, expected "${target.approvedFinishedAt}".`
      );
    }

    // Repository Linkage Checks
    const linkedAttempts = await PaymentAttemptRepository.findByTransactionId(target.txnId);
    if (linkedAttempts.length !== 1 || linkedAttempts[0].id !== target.attemptId) {
      issues.push(`Post-verification failed: findByTransactionId("${target.txnId}") did not return expected attempt.`);
    }

    const attemptByRef = await PaymentAttemptRepository.findByGatewayRef('stripe', target.expectedTxnGatewayRef);
    if (!attemptByRef || attemptByRef.id !== target.attemptId) {
      issues.push(`Post-verification failed: findByGatewayRef("stripe", "${target.expectedTxnGatewayRef}") did not return expected attempt.`);
    }
  }

  return {
    verified: issues.length === 0,
    issues,
  };
}

/**
 * Script entrypoint. Defaults strictly to dry-run unless --execute flag is passed.
 */
export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  const isExecute = args.includes('--execute') || args.includes('--commit');
  const mode = isExecute ? 'EXECUTE (WRITES ENABLED)' : 'DRY-RUN (READ-ONLY)';

  console.log('=== PayRoute Historical Attempt Repair ===');
  console.log(`Mode: ${mode}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  try {
    await connectMongo();
    const client = getMongoClient();

    // Step 1: Precondition check
    console.log('\n[Step 1/3] Validating preconditions across all 4 documents...');
    const check = await validatePreconditions();
    if (!check.valid) {
      console.error('\n❌ Precondition validation FAILED:');
      check.errors.forEach((e) => console.error(`  - ${e}`));
      throw new Error('Precondition check failed. Aborting without changes.');
    }
    console.log('✓ All 4 documents verified and match expected preconditions.');

    // Step 2: Dry-run diff display
    generateDryRunPlan(check.documents);

    if (!isExecute) {
      console.log('\n================================================================');
      console.log('✓ Dry-run completed successfully. Zero database writes performed.');
      console.log('To execute the repair in a committed transaction, re-run with:');
      console.log('  npx tsx backend/src/scripts/repair-historical-attempts.ts --execute');
      console.log('================================================================');
      return;
    }

    // Step 3: Transaction Execution (only if --execute is explicitly provided)
    console.log('\n[Step 2/3] Executing updates in atomic MongoDB transaction...');
    const result = await executeRepairTransaction(client);
    console.log(`✓ MongoDB transaction committed successfully. (${result.modifiedCount} documents updated)`);

    // Step 4: Post-repair verification
    console.log('\n[Step 3/3] Performing fresh read-only post-repair verification...');
    const postCheck = await verifyPostConditions();
    if (!postCheck.verified) {
      console.error('\n❌ Post-repair verification FAILED:');
      postCheck.issues.forEach((i) => console.error(`  - ${i}`));
      throw new Error('Post-repair verification failed.');
    }
    console.log('✓ All 4 documents and repository linkages verified in post-repair audit.');
    console.log('\n🎉 Repair completed successfully.');
  } finally {
    await closeMongo();
  }
}

// Only invoke automatically when run directly via CLI
if (process.argv[1] && process.argv[1].includes('repair-historical-attempts')) {
  main().catch((err) => {
    console.error('\n❌ Script aborted with error:', err.message);
    process.exit(1);
  });
}
