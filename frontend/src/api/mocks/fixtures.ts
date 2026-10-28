import {
  GatewayAdminCardData,
  OverviewData,
  PaymentAttempt,
  RetryJobRecord,
  SystemHealthData,
  Transaction,
  WebhookEvent
} from '@payroute/shared';

export const mockTransactions: Transaction[] = [
  {
    id: 'txn_01J9ZK3Q8M2V5T7R1B4N6C0XYD',
    clientId: 'usr_01H8X700000000000000000001',
    amount: 49900,
    currency: 'inr',
    status: 'SUCCESS',
    description: 'Order #1042 - Premium Plan',
    customer: { reference: 'cust_98231' },
    metadata: { orderId: '1042', env: 'test' },
    idempotencyKey: 'idem-key-88219-abc',
    requestHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    paymentMethodType: 'test_token',
    routing: {
      preferredGateway: 'stripe',
      exhaustedGateways: [],
      currentGateway: 'stripe',
      gatewayGenerations: { stripe: 1, razorpay: 0 }
    },
    attemptCount: 1,
    retryCount: 0,
    finalGateway: 'stripe',
    gatewayReference: 'pi_3P500000000000000000001',
    failure: null,
    flags: [],
    timeline: [
      { at: '2026-10-08T10:15:00.000Z', type: 'transaction.created', detail: { amount: 49900, currency: 'inr' } },
      { at: '2026-10-08T10:15:00.120Z', type: 'attempt.started', detail: { attemptNumber: 1, gateway: 'stripe' } },
      { at: '2026-10-08T10:15:00.430Z', type: 'attempt.accepted', detail: { gatewayReference: 'pi_3P500000000000000000001' } },
      { at: '2026-10-08T10:15:01.200Z', type: 'webhook.succeeded', detail: { eventId: 'evt_stripe_101' } }
    ],
    version: 3,
    createdAt: '2026-10-08T10:15:00.000Z',
    updatedAt: '2026-10-08T10:15:01.200Z',
    completedAt: '2026-10-08T10:15:01.200Z'
  },
  {
    id: 'txn_01J9ZK4A9N3W6U8S2C5O7D1YZE',
    clientId: 'usr_01H8X700000000000000000001',
    amount: 12500,
    currency: 'inr',
    status: 'SUCCESS',
    description: 'Order #1043 - Monthly Subscription',
    customer: { reference: 'cust_77210' },
    metadata: { orderId: '1043' },
    idempotencyKey: 'idem-key-99321-xyz',
    requestHash: '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
    paymentMethodType: 'test_token',
    routing: {
      preferredGateway: 'stripe',
      exhaustedGateways: ['stripe'],
      currentGateway: 'razorpay',
      gatewayGenerations: { stripe: 3, razorpay: 1 }
    },
    attemptCount: 4,
    retryCount: 3,
    finalGateway: 'razorpay',
    gatewayReference: 'order_Nxx9938210001',
    failure: null,
    flags: [],
    timeline: [
      { at: '2026-10-08T09:40:00.000Z', type: 'transaction.created', detail: { amount: 12500 } },
      { at: '2026-10-08T09:40:00.100Z', type: 'attempt.started', detail: { attemptNumber: 1, gateway: 'stripe' } },
      { at: '2026-10-08T09:40:08.100Z', type: 'attempt.failed', detail: { error: 'TIMEOUT' } },
      { at: '2026-10-08T09:40:09.150Z', type: 'attempt.started', detail: { attemptNumber: 2, gateway: 'stripe' } },
      { at: '2026-10-08T09:40:09.562Z', type: 'attempt.failed', detail: { error: 'SERVER_ERROR 503' } },
      { at: '2026-10-08T09:40:11.600Z', type: 'attempt.started', detail: { attemptNumber: 3, gateway: 'stripe' } },
      { at: '2026-10-08T09:40:12.012Z', type: 'attempt.failed', detail: { error: 'SERVER_ERROR 503' } },
      { at: '2026-10-08T09:40:12.020Z', type: 'gateway.fallback', detail: { from: 'stripe', to: 'razorpay' } },
      { at: '2026-10-08T09:40:12.050Z', type: 'attempt.started', detail: { attemptNumber: 4, gateway: 'razorpay' } },
      { at: '2026-10-08T09:40:12.690Z', type: 'attempt.accepted', detail: { gatewayReference: 'order_Nxx9938210001' } },
      { at: '2026-10-08T09:40:13.500Z', type: 'webhook.succeeded', detail: { eventId: 'evt_rzp_202' } }
    ],
    version: 8,
    createdAt: '2026-10-08T09:40:00.000Z',
    updatedAt: '2026-10-08T09:40:13.500Z',
    completedAt: '2026-10-08T09:40:13.500Z'
  },
  {
    id: 'txn_01J9ZK5B0O4X7V9T3D6P8E2ZFA',
    clientId: 'usr_01H8X700000000000000000001',
    amount: 85000,
    currency: 'inr',
    status: 'FAILED',
    description: 'Order #1044 - Enterprise Addon',
    customer: { reference: 'cust_11204' },
    metadata: { orderId: '1044' },
    idempotencyKey: 'idem-key-77112-ppp',
    requestHash: '6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b',
    paymentMethodType: 'test_token',
    routing: {
      preferredGateway: 'stripe',
      exhaustedGateways: ['stripe', 'razorpay'],
      currentGateway: null,
      gatewayGenerations: { stripe: 3, razorpay: 3 }
    },
    attemptCount: 6,
    retryCount: 5,
    finalGateway: null,
    gatewayReference: null,
    failure: {
      code: 'RETRIES_EXHAUSTED',
      message: 'Retry budget exhausted on every eligible gateway',
      gateway: 'razorpay'
    },
    flags: [],
    timeline: [
      { at: '2026-10-08T09:10:00.000Z', type: 'transaction.created', detail: { amount: 85000 } },
      { at: '2026-10-08T09:10:25.000Z', type: 'transaction.failed', detail: { code: 'RETRIES_EXHAUSTED' } }
    ],
    version: 12,
    createdAt: '2026-10-08T09:10:00.000Z',
    updatedAt: '2026-10-08T09:10:25.000Z',
    completedAt: '2026-10-08T09:10:25.000Z'
  },
  {
    id: 'txn_01J9ZK6C1P5Y8W0U4E7Q9F3ZGB',
    clientId: 'usr_01H8X700000000000000000001',
    amount: 3000,
    currency: 'usd',
    status: 'AWAITING_CONFIRMATION',
    description: 'Order #1045 - International Pass',
    customer: { reference: 'cust_88201' },
    metadata: { orderId: '1045' },
    idempotencyKey: 'idem-key-44102-rrr',
    requestHash: 'd4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35',
    paymentMethodType: 'test_token',
    routing: {
      preferredGateway: 'stripe',
      exhaustedGateways: [],
      currentGateway: 'stripe',
      gatewayGenerations: { stripe: 1, razorpay: 0 }
    },
    attemptCount: 1,
    retryCount: 0,
    finalGateway: 'stripe',
    gatewayReference: 'pi_3P500000000000000000002',
    failure: null,
    flags: [],
    timeline: [
      { at: '2026-10-08T10:17:00.000Z', type: 'transaction.created', detail: { amount: 3000 } },
      { at: '2026-10-08T10:17:00.310Z', type: 'attempt.accepted', detail: { gatewayReference: 'pi_3P500000000000000000002' } }
    ],
    version: 2,
    createdAt: '2026-10-08T10:17:00.000Z',
    updatedAt: '2026-10-08T10:17:00.310Z',
    completedAt: null
  },
  {
    id: 'txn_01J9ZK7D2Q6Z9X1V5F8R0G4ZHC',
    clientId: 'usr_01H8X700000000000000000001',
    amount: 9900,
    currency: 'inr',
    status: 'SUCCESS',
    description: 'Order #1046 - Late Confirmation Case',
    customer: { reference: 'cust_33910' },
    metadata: { orderId: '1046' },
    idempotencyKey: 'idem-key-55112-eee',
    requestHash: '4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce',
    paymentMethodType: 'test_token',
    routing: {
      preferredGateway: 'stripe',
      exhaustedGateways: ['stripe'],
      currentGateway: 'razorpay',
      gatewayGenerations: { stripe: 1, razorpay: 1 }
    },
    attemptCount: 2,
    retryCount: 1,
    finalGateway: 'stripe',
    gatewayReference: 'pi_3P500000000000000000003',
    failure: null,
    flags: ['LATE_SUCCESS'],
    timeline: [
      { at: '2026-10-08T08:30:00.000Z', type: 'transaction.created', detail: { amount: 9900 } },
      { at: '2026-10-08T08:30:08.000Z', type: 'attempt.failed', detail: { error: 'TIMEOUT' } },
      { at: '2026-10-08T08:30:08.010Z', type: 'gateway.fallback', detail: { from: 'stripe', to: 'razorpay' } },
      { at: '2026-10-08T08:31:00.000Z', type: 'webhook.late_success', detail: { eventId: 'evt_stripe_999', flag: 'LATE_SUCCESS' } }
    ],
    version: 5,
    createdAt: '2026-10-08T08:30:00.000Z',
    updatedAt: '2026-10-08T08:31:00.000Z',
    completedAt: '2026-10-08T08:31:00.000Z'
  }
];

export const mockAttempts: PaymentAttempt[] = [
  {
    id: 'att_01J9ZK3R2A0000000000000001',
    transactionId: 'txn_01J9ZK3Q8M2V5T7R1B4N6C0XYD',
    attemptNumber: 1,
    gateway: 'stripe',
    status: 'SUCCEEDED',
    gatewayIdempotencyKey: 'pr_txn_01J9ZK3Q8M2V5T7R1B4N6C0XYD_stripe_g1',
    gatewayReference: 'pi_3P500000000000000000001',
    routingDecision: {
      strategy: 'deterministic-v1',
      selected: 'stripe',
      reason: 'PRIMARY',
      considered: [
        { gateway: 'stripe', eligible: true, circuitState: 'CLOSED', healthStatus: 'HEALTHY' },
        { gateway: 'razorpay', eligible: true, circuitState: 'CLOSED', healthStatus: 'HEALTHY' }
      ],
      decidedAt: '2026-10-08T10:15:00.100Z'
    },
    isProbe: false,
    error: null,
    latencyMs: 310,
    startedAt: '2026-10-08T10:15:00.120Z',
    finishedAt: '2026-10-08T10:15:00.430Z',
    createdAt: '2026-10-08T10:15:00.100Z'
  },
  {
    id: 'att_01J9ZK4A9N0000000000000001',
    transactionId: 'txn_01J9ZK4A9N3W6U8S2C5O7D1YZE',
    attemptNumber: 1,
    gateway: 'stripe',
    status: 'FAILED',
    gatewayIdempotencyKey: 'pr_txn_01J9ZK4A9N3W6U8S2C5O7D1YZE_stripe_g1',
    gatewayReference: null,
    routingDecision: {
      strategy: 'deterministic-v1',
      selected: 'stripe',
      reason: 'PRIMARY',
      considered: [
        { gateway: 'stripe', eligible: true, circuitState: 'CLOSED', healthStatus: 'DEGRADED' },
        { gateway: 'razorpay', eligible: true, circuitState: 'CLOSED', healthStatus: 'HEALTHY' }
      ],
      decidedAt: '2026-10-08T09:40:00.050Z'
    },
    isProbe: false,
    error: {
      kind: 'TIMEOUT',
      retryClass: 'RETRY',
      ambiguous: true,
      message: 'Gateway request timed out after 8000ms'
    },
    latencyMs: 8001,
    startedAt: '2026-10-08T09:40:00.100Z',
    finishedAt: '2026-10-08T09:40:08.101Z',
    createdAt: '2026-10-08T09:40:00.050Z'
  },
  {
    id: 'att_01J9ZK4A9N0000000000000002',
    transactionId: 'txn_01J9ZK4A9N3W6U8S2C5O7D1YZE',
    attemptNumber: 2,
    gateway: 'stripe',
    status: 'FAILED',
    gatewayIdempotencyKey: 'pr_txn_01J9ZK4A9N3W6U8S2C5O7D1YZE_stripe_g1',
    gatewayReference: null,
    routingDecision: {
      strategy: 'deterministic-v1',
      selected: 'stripe',
      reason: 'PRIMARY',
      considered: [
        { gateway: 'stripe', eligible: true, circuitState: 'CLOSED', healthStatus: 'DEGRADED' },
        { gateway: 'razorpay', eligible: true, circuitState: 'CLOSED', healthStatus: 'HEALTHY' }
      ],
      decidedAt: '2026-10-08T09:40:09.100Z'
    },
    isProbe: false,
    error: {
      kind: 'SERVER_ERROR',
      retryClass: 'RETRY',
      ambiguous: false,
      httpStatus: 503,
      gatewayCode: 'api_error',
      message: 'Stripe API 503 Service Unavailable'
    },
    latencyMs: 412,
    startedAt: '2026-10-08T09:40:09.150Z',
    finishedAt: '2026-10-08T09:40:09.562Z',
    createdAt: '2026-10-08T09:40:09.100Z'
  },
  {
    id: 'att_01J9ZK4A9N0000000000000003',
    transactionId: 'txn_01J9ZK4A9N3W6U8S2C5O7D1YZE',
    attemptNumber: 3,
    gateway: 'stripe',
    status: 'FAILED',
    gatewayIdempotencyKey: 'pr_txn_01J9ZK4A9N3W6U8S2C5O7D1YZE_stripe_g2',
    gatewayReference: null,
    routingDecision: {
      strategy: 'deterministic-v1',
      selected: 'stripe',
      reason: 'PRIMARY',
      considered: [
        { gateway: 'stripe', eligible: true, circuitState: 'CLOSED', healthStatus: 'DEGRADED' },
        { gateway: 'razorpay', eligible: true, circuitState: 'CLOSED', healthStatus: 'HEALTHY' }
      ],
      decidedAt: '2026-10-08T09:40:11.550Z'
    },
    isProbe: false,
    error: {
      kind: 'SERVER_ERROR',
      retryClass: 'RETRY',
      ambiguous: false,
      httpStatus: 503,
      gatewayCode: 'api_error',
      message: 'Stripe API 503 Service Unavailable'
    },
    latencyMs: 412,
    startedAt: '2026-10-08T09:40:11.600Z',
    finishedAt: '2026-10-08T09:40:12.012Z',
    createdAt: '2026-10-08T09:40:11.550Z'
  },
  {
    id: 'att_01J9ZK4A9N0000000000000004',
    transactionId: 'txn_01J9ZK4A9N3W6U8S2C5O7D1YZE',
    attemptNumber: 4,
    gateway: 'razorpay',
    status: 'SUCCEEDED',
    gatewayIdempotencyKey: 'pr_txn_01J9ZK4A9N3W6U8S2C5O7D1YZE_razorpay_g1',
    gatewayReference: 'order_Nxx9938210001',
    routingDecision: {
      strategy: 'deterministic-v1',
      selected: 'razorpay',
      reason: 'FALLBACK_AFTER_EXHAUSTION',
      considered: [
        { gateway: 'stripe', eligible: true, circuitState: 'CLOSED', healthStatus: 'DOWN', skippedReason: 'EXHAUSTED' },
        { gateway: 'razorpay', eligible: true, circuitState: 'CLOSED', healthStatus: 'HEALTHY' }
      ],
      decidedAt: '2026-10-08T09:40:12.030Z'
    },
    isProbe: false,
    error: null,
    latencyMs: 640,
    startedAt: '2026-10-08T09:40:12.050Z',
    finishedAt: '2026-10-08T09:40:12.690Z',
    createdAt: '2026-10-08T09:40:12.030Z'
  }
];

export const mockWebhooks: WebhookEvent[] = [
  {
    id: 'whe_01J9ZK3S3B0000000000000001',
    gateway: 'stripe',
    eventId: 'evt_stripe_101',
    eventType: 'payment_intent.succeeded',
    status: 'PROCESSED',
    payloadSnapshot: {
      id: 'evt_stripe_101',
      type: 'payment_intent.succeeded',
      object_id: 'pi_3P500000000000000000001',
      status: 'succeeded',
      amount: 49900,
      currency: 'inr'
    },
    rawBodyHash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    transactionId: 'txn_01J9ZK3Q8M2V5T7R1B4N6C0XYD',
    attemptId: 'att_01J9ZK3R2A0000000000000001',
    duplicateCount: 2,
    lastDuplicateAt: '2026-10-08T10:16:00.000Z',
    processingAttempts: 1,
    lastError: null,
    requestId: 'req_01J9ZK3Q8M',
    receivedAt: '2026-10-08T10:15:01.000Z',
    enqueuedAt: '2026-10-08T10:15:01.050Z',
    processingStartedAt: '2026-10-08T10:15:01.100Z',
    processedAt: '2026-10-08T10:15:01.200Z',
    failedAt: null
  },
  {
    id: 'whe_01J9ZK4B0O0000000000000002',
    gateway: 'razorpay',
    eventId: 'evt_rzp_202',
    eventType: 'payment.captured',
    status: 'PROCESSED',
    payloadSnapshot: {
      id: 'evt_rzp_202',
      event: 'payment.captured',
      order_id: 'order_Nxx9938210001',
      amount: 12500,
      currency: 'INR'
    },
    rawBodyHash: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
    transactionId: 'txn_01J9ZK4A9N3W6U8S2C5O7D1YZE',
    attemptId: 'att_01J9ZK4A9N0000000000000004',
    duplicateCount: 0,
    lastDuplicateAt: null,
    processingAttempts: 1,
    lastError: null,
    requestId: 'req_01J9ZK4A9N',
    receivedAt: '2026-10-08T09:40:13.000Z',
    enqueuedAt: '2026-10-08T09:40:13.020Z',
    processingStartedAt: '2026-10-08T09:40:13.100Z',
    processedAt: '2026-10-08T09:40:13.500Z',
    failedAt: null
  },
  {
    id: 'whe_01J9ZK5C1P0000000000000003',
    gateway: 'stripe',
    eventId: 'evt_stripe_orphan_999',
    eventType: 'payment_intent.succeeded',
    status: 'ORPHANED',
    payloadSnapshot: {
      id: 'evt_stripe_orphan_999',
      type: 'payment_intent.succeeded',
      object_id: 'pi_unknown_123',
      amount: 5000,
      currency: 'usd'
    },
    rawBodyHash: '11a8a63780c8502365337966149051954619b0d6656aea734284561b6264d858',
    transactionId: null,
    attemptId: null,
    duplicateCount: 0,
    lastDuplicateAt: null,
    processingAttempts: 5,
    lastError: 'No matching attempt or transaction found for pi_unknown_123',
    requestId: 'req_01J9ZK5C1P',
    receivedAt: '2026-10-08T08:00:00.000Z',
    enqueuedAt: '2026-10-08T08:00:00.010Z',
    processingStartedAt: '2026-10-08T08:00:16.000Z',
    processedAt: null,
    failedAt: '2026-10-08T08:00:16.100Z'
  }
];

export const mockRetryJobs: RetryJobRecord[] = [
  {
    id: 'rj_01J9ZK4A9N0000000000000001',
    queueJobId: 'txn_01J9ZK4A9N3W6U8S2C5O7D1YZE-a2',
    transactionId: 'txn_01J9ZK4A9N3W6U8S2C5O7D1YZE',
    type: 'PAYMENT_RETRY',
    attemptNumber: 2,
    gateway: 'stripe',
    status: 'COMPLETED',
    reason: 'TIMEOUT',
    delayMs: 1040,
    scheduledFor: '2026-10-08T09:40:09.141Z',
    startedAt: '2026-10-08T09:40:09.150Z',
    finishedAt: '2026-10-08T09:40:09.562Z',
    createdAt: '2026-10-08T09:40:08.101Z'
  },
  {
    id: 'rj_01J9ZK4A9N0000000000000002',
    queueJobId: 'txn_01J9ZK4A9N3W6U8S2C5O7D1YZE-a3',
    transactionId: 'txn_01J9ZK4A9N3W6U8S2C5O7D1YZE',
    type: 'PAYMENT_RETRY',
    attemptNumber: 3,
    gateway: 'stripe',
    status: 'COMPLETED',
    reason: 'SERVER_ERROR',
    delayMs: 2038,
    scheduledFor: '2026-10-08T09:40:11.600Z',
    startedAt: '2026-10-08T09:40:11.600Z',
    finishedAt: '2026-10-08T09:40:12.012Z',
    createdAt: '2026-10-08T09:40:09.562Z'
  },
  {
    id: 'rj_01J9ZK4A9N0000000000000003',
    queueJobId: 'txn_01J9ZK4A9N3W6U8S2C5O7D1YZE-a4',
    transactionId: 'txn_01J9ZK4A9N3W6U8S2C5O7D1YZE',
    type: 'FALLBACK',
    attemptNumber: 4,
    gateway: 'razorpay',
    status: 'COMPLETED',
    reason: 'FALLBACK_AFTER_EXHAUSTION',
    delayMs: 0,
    scheduledFor: '2026-10-08T09:40:12.012Z',
    startedAt: '2026-10-08T09:40:12.050Z',
    finishedAt: '2026-10-08T09:40:12.690Z',
    createdAt: '2026-10-08T09:40:12.012Z'
  }
];

export const mockOverviewData: OverviewData = {
  kpis: {
    transactions: 142,
    successRate: 0.968,
    avgLatencyMs: 385,
    retriesScheduled: 18,
    fallbacks: 4,
    duplicateWebhooksIgnored: 12,
    failedWebhooks: 1,
    suspectedDuplicateCharges: 0
  },
  statusCounts: {
    CREATED: 2,
    PROCESSING: 1,
    RETRYING: 3,
    AWAITING_CONFIRMATION: 5,
    SUCCESS: 128,
    FAILED: 3,
    CANCELLED: 0
  },
  series: [
    { t: '10:00', stripe: { ok: 15, fault: 0 }, razorpay: { ok: 2, fault: 0 } },
    { t: '10:05', stripe: { ok: 18, fault: 1 }, razorpay: { ok: 3, fault: 0 } },
    { t: '10:10', stripe: { ok: 12, fault: 3 }, razorpay: { ok: 8, fault: 0 } },
    { t: '10:15', stripe: { ok: 22, fault: 0 }, razorpay: { ok: 1, fault: 0 } }
  ],
  gateways: [
    { name: 'stripe', status: 'HEALTHY', circuitState: 'CLOSED', successRate5m: 0.992 },
    { name: 'razorpay', status: 'HEALTHY', circuitState: 'CLOSED', successRate5m: 1.0 }
  ],
  queues: {
    payments: { waiting: 0, active: 1, delayed: 2, failed: 0 },
    webhooks: { waiting: 0, active: 0, delayed: 0, failed: 0 }
  },
  recentFailures: [
    {
      id: 'txn_01J9ZK5B0O4X7V9T3D6P8E2ZFA',
      code: 'RETRIES_EXHAUSTED',
      gateway: 'razorpay',
      at: '2026-10-08T09:10:25.000Z'
    }
  ]
};

export const mockGateways: GatewayAdminCardData[] = [
  {
    name: 'stripe',
    enabled: true,
    status: 'HEALTHY',
    circuitState: 'CLOSED',
    consecutiveFailures: 0,
    successCount: 1240,
    failureCount: 14,
    window5m: {
      total: 67,
      successRate: 0.992,
      avgLatencyMs: 312,
      p95LatencyMs: 520
    },
    lastSuccessAt: '2026-10-08T10:18:02.000Z',
    lastFailureAt: '2026-10-08T09:40:12.000Z',
    lastFailureReason: 'SERVER_ERROR',
    nextProbeAt: null,
    recentTransitions: [
      { from: 'OPEN', to: 'HALF_OPEN', at: '2026-10-08T09:45:00.000Z', reason: 'PROBE_TIMEOUT_ELAPSED' },
      { from: 'HALF_OPEN', to: 'CLOSED', at: '2026-10-08T09:45:02.000Z', reason: 'PROBE_OK' }
    ],
    activity60m: Array.from({ length: 60 }, (_, i) => ({
      t: `${i}m`,
      ok: Math.floor(Math.random() * 5) + 2,
      fault: i === 20 ? 3 : 0
    }))
  },
  {
    name: 'razorpay',
    enabled: true,
    status: 'HEALTHY',
    circuitState: 'CLOSED',
    consecutiveFailures: 0,
    successCount: 480,
    failureCount: 2,
    window5m: {
      total: 18,
      successRate: 1.0,
      avgLatencyMs: 420,
      p95LatencyMs: 780
    },
    lastSuccessAt: '2026-10-08T10:17:40.000Z',
    lastFailureAt: '2026-10-08T07:20:00.000Z',
    lastFailureReason: 'TIMEOUT',
    nextProbeAt: null,
    recentTransitions: [],
    activity60m: Array.from({ length: 60 }, (_, i) => ({
      t: `${i}m`,
      ok: Math.floor(Math.random() * 3),
      fault: 0
    }))
  }
];

export const mockSystemHealth: SystemHealthData = {
  api: {
    status: 'OK',
    uptimeSeconds: 86400,
    version: '1.0.0',
    nodeVersion: 'v20.14.0'
  },
  mongo: {
    status: 'OK',
    pingMs: 4
  },
  redis: {
    status: 'OK',
    pingMs: 2
  },
  worker: {
    status: 'OK',
    lastHeartbeatAt: new Date().toISOString()
  },
  queues: {
    payments: { waiting: 0, active: 0, delayed: 0, failed: 0 },
    webhooks: { waiting: 0, active: 0, delayed: 0, failed: 0 }
  },
  sweeper: {
    lastRunAt: new Date().toISOString(),
    lastRunDurationMs: 42,
    repairsLastRun: 0
  },
  gateways: [
    { name: 'stripe', status: 'HEALTHY', circuitState: 'CLOSED' },
    { name: 'razorpay', status: 'HEALTHY', circuitState: 'CLOSED' }
  ]
};
