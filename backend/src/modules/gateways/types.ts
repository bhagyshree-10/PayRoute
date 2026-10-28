import { GatewayName, ErrorKind, RetryClass } from '@payroute/shared';

export interface GatewayCallContext {
  gatewayIdempotencyKey: string;
  timeoutMs: number;
  transactionId: string;
  correlationAttemptId: string;
}

export interface GatewayPaymentInput {
  amount: number;
  currency: string;
  customerReference: string;
  paymentMethodToken?: string;
  metadata?: Record<string, string>;
}

export interface GatewayPaymentResult {
  outcome: 'ACCEPTED';
  gatewayReference: string;
  gatewayStatus: string;
  latencyMs: number;
}

export interface VerifiedWebhookEvent {
  gateway: GatewayName;
  eventId: string;
  eventType: string;
  payloadSnapshot: Record<string, unknown>;
  rawBodyHash: string;
}

export interface NormalizedPaymentStatus {
  gatewayStatus: string;
  outcome: 'SUCCEEDED' | 'FAILED' | 'AWAITING_CONFIRMATION';
  gatewayReference: string;
}

export interface PaymentGateway {
  readonly name: GatewayName;
  readonly supportedCurrencies: string[];
  createPayment(input: GatewayPaymentInput, ctx: GatewayCallContext): Promise<GatewayPaymentResult>;
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | undefined>): VerifiedWebhookEvent;
  fetchPaymentStatus(gatewayReference: string): Promise<NormalizedPaymentStatus>;
}

export class GatewayError extends Error {
  kind: ErrorKind;
  retryClass: RetryClass;
  ambiguous: boolean;
  countsAgainstBreaker: boolean;
  httpStatus?: number;
  gatewayCode?: string;
  retryAfterMs?: number;

  constructor({
    kind,
    retryClass,
    message,
    ambiguous = false,
    countsAgainstBreaker = true,
    httpStatus,
    gatewayCode,
    retryAfterMs,
  }: {
    kind: ErrorKind;
    retryClass: RetryClass;
    message: string;
    ambiguous?: boolean;
    countsAgainstBreaker?: boolean;
    httpStatus?: number;
    gatewayCode?: string;
    retryAfterMs?: number;
  }) {
    super(message);
    this.name = 'GatewayError';
    this.kind = kind;
    this.retryClass = retryClass;
    this.ambiguous = ambiguous;
    this.countsAgainstBreaker = countsAgainstBreaker;
    this.httpStatus = httpStatus;
    this.gatewayCode = gatewayCode;
    this.retryAfterMs = retryAfterMs;
  }
}
