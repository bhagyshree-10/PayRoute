import {
  AttemptStatus,
  CircuitState,
  Currency,
  ErrorKind,
  GatewayName,
  HealthStatus,
  RetryClass,
  RetryJobStatus,
  RetryJobType,
  RoutingReason,
  RoutingSkippedReason,
  SimulationMode,
  TransactionFlag,
  TransactionStatus,
  WebhookStatus
} from './constants.js';

export interface RoutingDecisionConsidered {
  gateway: GatewayName;
  eligible: boolean;
  circuitState: CircuitState;
  healthStatus: HealthStatus;
  skippedReason?: RoutingSkippedReason;
}

export interface RoutingDecision {
  strategy: 'deterministic-v1';
  selected: GatewayName | null;
  reason: RoutingReason;
  considered: RoutingDecisionConsidered[];
  decidedAt: string | Date;
}

export interface TimelineEvent {
  at: string | Date;
  type: string;
  detail: Record<string, unknown>;
}

export interface TransactionCustomer {
  reference: string;
}

export interface TransactionPaymentMethod {
  type: 'test_token';
  token?: string;
}

export interface Transaction {
  _id?: string;
  id: string;
  clientId: string;
  amount: number;
  currency: Currency;
  status: TransactionStatus;
  description?: string;
  customer: TransactionCustomer;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
  requestHash?: string;
  paymentMethodType: 'test_token';
  routing: {
    preferredGateway: GatewayName | null;
    exhaustedGateways: GatewayName[];
    currentGateway: GatewayName | null;
    gatewayGenerations: Record<GatewayName, number>;
  };
  attemptCount: number;
  retryCount: number;
  finalGateway?: GatewayName | null;
  gatewayReference?: string | null;
  failure?: {
    code: string;
    message: string;
    gateway?: string | null;
  } | null;
  flags: TransactionFlag[];
  timeline: TimelineEvent[];
  version: number;
  createdAt: string | Date;
  updatedAt: string | Date;
  completedAt?: string | Date | null;
}

export interface AttemptError {
  kind: ErrorKind;
  retryClass: RetryClass;
  ambiguous: boolean;
  httpStatus?: number;
  gatewayCode?: string;
  message: string;
}

export interface PaymentAttempt {
  _id?: string;
  id: string;
  transactionId: string;
  attemptNumber: number;
  gateway: GatewayName;
  status: AttemptStatus;
  gatewayIdempotencyKey: string;
  gatewayReference?: string | null;
  routingDecision: RoutingDecision;
  isProbe: boolean;
  error?: AttemptError | null;
  latencyMs?: number | null;
  startedAt: string | Date;
  finishedAt?: string | Date | null;
  createdAt: string | Date;
}

export interface WebhookEvent {
  _id?: string;
  id: string;
  gateway: GatewayName;
  eventId: string;
  eventType: string;
  status: WebhookStatus;
  payloadSnapshot: Record<string, unknown>;
  rawBodyHash: string;
  transactionId?: string | null;
  attemptId?: string | null;
  duplicateCount: number;
  lastDuplicateAt?: string | Date | null;
  processingAttempts: number;
  lastError?: string | null;
  requestId: string;
  receivedAt: string | Date;
  enqueuedAt?: string | Date | null;
  processingStartedAt?: string | Date | null;
  processedAt?: string | Date | null;
  failedAt?: string | Date | null;
}

export interface GatewayTransition {
  from: CircuitState;
  to: CircuitState;
  at: string | Date;
  reason: string;
}

export interface GatewayHealth {
  _id?: GatewayName;
  id: GatewayName;
  enabled: boolean;
  state: CircuitState;
  consecutiveFailures: number;
  successCount: number;
  failureCount: number;
  lastSuccessAt?: string | Date | null;
  lastFailureAt?: string | Date | null;
  lastFailureReason?: ErrorKind | null;
  openedAt?: string | Date | null;
  nextProbeAt?: string | Date | null;
  probeStartedAt?: string | Date | null;
  probeInFlight: boolean;
  recentTransitions: GatewayTransition[];
  simulation?: {
    mode: SimulationMode;
    expiresAt?: string | Date | null;
  };
  updatedAt: string | Date;
}

export interface RetryJobRecord {
  _id?: string;
  id: string;
  queueJobId: string;
  transactionId: string;
  type: RetryJobType;
  attemptNumber: number;
  gateway?: GatewayName | null;
  status: RetryJobStatus;
  reason: string;
  delayMs: number;
  scheduledFor: string | Date;
  startedAt?: string | Date | null;
  finishedAt?: string | Date | null;
  createdAt: string | Date;
}

export interface IdempotencyRecord {
  _id?: string;
  clientId: string;
  key: string;
  requestHash: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  transactionId: string;
  response: {
    status: number;
    body: Record<string, any>;
  } | null;
  lockedAt: Date;
  createdAt: Date;
  completedAt?: Date | null;
  expiresAt: Date;
}

export interface UserDoc {
  _id: string;
  type: 'admin' | 'client';
  name: string;
  email?: string;
  passwordHash?: string;
  apiKeyHash?: string;
  apiKeyPrefix?: string;
  status: 'active' | 'disabled';
  createdAt: string | Date;
  lastLoginAt?: string | Date | null;
}

// API DTO Envelopes & Admin Dashboard Query Models
export interface ApiMeta {
  requestId: string;
  limit?: number;
  nextCursor?: string | null;
}

export interface ApiSuccessResponse<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiErrorDetail {
  path?: (string | number)[];
  message: string;
}

export interface ApiErrorPayload {
  code: string;
  category: string;
  message: string;
  details?: ApiErrorDetail[] | null;
  retryable: boolean;
  requestId: string;
}

export interface ApiErrorResponse {
  error: ApiErrorPayload;
}

// Overview API Data DTO
export interface OverviewKpis {
  transactions: number;
  successRate: number;
  avgLatencyMs: number;
  retriesScheduled: number;
  fallbacks: number;
  duplicateWebhooksIgnored: number;
  failedWebhooks: number;
  suspectedDuplicateCharges: number;
}

export interface SeriesBucket {
  t: string;
  stripe: { ok: number; fault: number };
  razorpay: { ok: number; fault: number };
}

export interface QueueCounts {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
}

export interface OverviewData {
  kpis: OverviewKpis;
  statusCounts: Record<TransactionStatus, number>;
  series: SeriesBucket[];
  gateways: Array<{
    name: GatewayName;
    status: HealthStatus;
    circuitState: CircuitState;
    successRate5m: number | null;
  }>;
  queues: {
    payments: QueueCounts;
    webhooks: QueueCounts;
  };
  recentFailures: Array<{
    id: string;
    code: string;
    gateway?: string | null;
    at: string;
  }>;
}

// Gateway Admin Card DTO
export interface GatewayWindow5m {
  total: number;
  successRate: number | null;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
}

export interface GatewayActivity60mBucket {
  t: string;
  ok: number;
  fault: number;
}

export interface GatewayAdminCardData {
  name: GatewayName;
  enabled: boolean;
  status: HealthStatus;
  circuitState: CircuitState;
  consecutiveFailures: number;
  successCount: number;
  failureCount: number;
  window5m: GatewayWindow5m;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastFailureReason?: ErrorKind | null;
  nextProbeAt?: string | null;
  recentTransitions: GatewayTransition[];
  activity60m: GatewayActivity60mBucket[];
}

// System Health Data DTO
export interface SystemHealthData {
  api: {
    status: 'OK' | 'DEGRADED' | 'DOWN';
    uptimeSeconds: number;
    version: string;
    nodeVersion: string;
  };
  mongo: {
    status: 'OK' | 'DEGRADED' | 'DOWN';
    pingMs: number;
  };
  redis: {
    status: 'OK' | 'DEGRADED' | 'DOWN';
    pingMs: number;
  };
  worker: {
    status: 'OK' | 'DEGRADED' | 'DOWN';
    lastHeartbeatAt?: string | null;
  };
  queues: {
    payments: QueueCounts;
    webhooks: QueueCounts;
  };
  sweeper: {
    lastRunAt?: string | null;
    lastRunDurationMs?: number | null;
    repairsLastRun?: number | null;
  };
  gateways: Array<{
    name: GatewayName;
    status: HealthStatus;
    circuitState: CircuitState;
  }>;
}
