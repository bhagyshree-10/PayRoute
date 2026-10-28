export const GATEWAY_NAMES = ['stripe', 'razorpay'] as const;
export type GatewayName = (typeof GATEWAY_NAMES)[number];

export const CURRENCIES = ['usd', 'inr', 'eur', 'gbp'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const TRANSACTION_STATUSES = [
  'CREATED',
  'PROCESSING',
  'RETRYING',
  'AWAITING_CONFIRMATION',
  'SUCCESS',
  'FAILED',
  'CANCELLED'
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const ATTEMPT_STATUSES = [
  'STARTED',
  'ACCEPTED',
  'SUCCEEDED',
  'FAILED',
  'UNKNOWN'
] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const WEBHOOK_STATUSES = [
  'RECEIVED',
  'PROCESSING',
  'PROCESSED',
  'IGNORED',
  'FAILED',
  'ORPHANED'
] as const;
export type WebhookStatus = (typeof WEBHOOK_STATUSES)[number];

export const CIRCUIT_STATES = ['CLOSED', 'OPEN', 'HALF_OPEN'] as const;
export type CircuitState = (typeof CIRCUIT_STATES)[number];

export const HEALTH_STATUSES = [
  'HEALTHY',
  'DEGRADED',
  'DOWN',
  'RECOVERING'
] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];

export const RETRY_CLASSES = ['RETRY', 'FALLBACK', 'TERMINAL'] as const;
export type RetryClass = (typeof RETRY_CLASSES)[number];

export const ERROR_KINDS = [
  'TIMEOUT',
  'NETWORK',
  'SERVER_ERROR',
  'RATE_LIMITED',
  'AUTH',
  'UNSUPPORTED',
  'INVALID_REQUEST',
  'CARD_DECLINED',
  'UNKNOWN'
] as const;
export type ErrorKind = (typeof ERROR_KINDS)[number];

export const ROUTING_REASONS = [
  'PRIMARY',
  'PREFERRED',
  'HEALTH_PREFERENCE',
  'CIRCUIT_FALLBACK',
  'FALLBACK_AFTER_EXHAUSTION',
  'HALF_OPEN_PROBE',
  'NONE_AVAILABLE'
] as const;
export type RoutingReason = (typeof ROUTING_REASONS)[number];

export const ROUTING_SKIPPED_REASONS = [
  'CURRENCY_UNSUPPORTED',
  'DISABLED',
  'CIRCUIT_OPEN',
  'EXHAUSTED',
  'PROBE_BUSY'
] as const;
export type RoutingSkippedReason = (typeof ROUTING_SKIPPED_REASONS)[number];

export const RETRY_JOB_TYPES = [
  'PAYMENT_RETRY',
  'FALLBACK',
  'ROUTING_WAIT'
] as const;
export type RetryJobType = (typeof RETRY_JOB_TYPES)[number];

export const RETRY_JOB_STATUSES = [
  'SCHEDULED',
  'ACTIVE',
  'COMPLETED',
  'FAILED',
  'CANCELLED'
] as const;
export type RetryJobStatus = (typeof RETRY_JOB_STATUSES)[number];

export const SIMULATION_MODES = [
  'NONE',
  'TIMEOUT',
  'HTTP_503',
  'HTTP_429',
  'NETWORK_RESET',
  'AUTH_ERROR',
  'DECLINE'
] as const;
export type SimulationMode = (typeof SIMULATION_MODES)[number];

export const TRANSACTION_FLAGS = [
  'LATE_SUCCESS',
  'DUPLICATE_CHARGE_SUSPECTED'
] as const;
export type TransactionFlag = (typeof TRANSACTION_FLAGS)[number];
