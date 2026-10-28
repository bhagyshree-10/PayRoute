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
  RoutingDecision,
  SimulationMode,
  TimelineEvent,
  TransactionFlag,
  TransactionStatus,
  UserDoc,
  WebhookStatus
} from '@payroute/shared';

export type {
  AttemptStatus,
  CircuitState,
  Currency,
  ErrorKind,
  GatewayName,
  HealthStatus,
  RetryClass,
  RetryJobStatus,
  RetryJobType,
  RoutingDecision,
  SimulationMode,
  TimelineEvent,
  TransactionFlag,
  TransactionStatus,
  UserDoc,
  WebhookStatus
};

export interface IdempotencyRecord {
  _id: string;
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
