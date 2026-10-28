import { env } from '../../config/env.js';
import { collections } from '../../infra/mongo.js';
import {
  GatewayCallContext,
  GatewayPaymentInput,
  GatewayPaymentResult,
  NormalizedPaymentStatus,
  PaymentGateway,
  VerifiedWebhookEvent,
  GatewayError
} from './types.js';
import { GatewayName, SimulationMode } from '@payroute/shared';

interface CachedSimulation {
  mode: SimulationMode;
  expiresAt: Date | null;
  fetchedAt: number;
}

const simulationCache: Map<GatewayName, CachedSimulation> = new Map();

async function getSimulationState(gatewayName: GatewayName): Promise<SimulationMode> {
  if (!env.ENABLE_FAILURE_INJECTION || env.NODE_ENV === 'production') {
    return 'NONE';
  }

  const now = Date.now();
  const cached = simulationCache.get(gatewayName);

  if (cached && now - cached.fetchedAt < 1000) {
    if (cached.expiresAt && cached.expiresAt.getTime() < now) {
      return 'NONE';
    }
    return cached.mode;
  }

  try {
    const doc = await collections.gatewayHealth().findOne({ _id: gatewayName as any });
    const mode: SimulationMode = doc?.simulation?.mode || 'NONE';
    const expiresAt = doc?.simulation?.expiresAt ? new Date(doc.simulation.expiresAt) : null;

    simulationCache.set(gatewayName, {
      mode,
      expiresAt,
      fetchedAt: now,
    });

    if (expiresAt && expiresAt.getTime() < now) {
      return 'NONE';
    }

    return mode;
  } catch {
    return 'NONE';
  }
}

export class FailureInjectionGatewayWrapper implements PaymentGateway {
  constructor(private delegate: PaymentGateway) {}

  get name() {
    return this.delegate.name;
  }

  get supportedCurrencies() {
    return this.delegate.supportedCurrencies;
  }

  async createPayment(input: GatewayPaymentInput, ctx: GatewayCallContext): Promise<GatewayPaymentResult> {
    const simMode = await getSimulationState(this.delegate.name);

    if (simMode !== 'NONE') {
      switch (simMode) {
        case 'TIMEOUT':
          throw new GatewayError({
            kind: 'TIMEOUT',
            retryClass: 'RETRY',
            message: `Simulated timeout error on gateway ${this.delegate.name}`,
            ambiguous: true,
            countsAgainstBreaker: true,
          });
        case 'HTTP_503':
          throw new GatewayError({
            kind: 'SERVER_ERROR',
            retryClass: 'RETRY',
            message: `Simulated HTTP 503 Service Unavailable on gateway ${this.delegate.name}`,
            ambiguous: false,
            countsAgainstBreaker: true,
            httpStatus: 503,
            gatewayCode: 'HTTP_503'
          });
        case 'HTTP_429':
          throw new GatewayError({
            kind: 'RATE_LIMITED',
            retryClass: 'RETRY',
            message: `Simulated HTTP 429 Rate Limited on gateway ${this.delegate.name}`,
            ambiguous: false,
            countsAgainstBreaker: true,
            httpStatus: 429,
            gatewayCode: 'RATE_LIMITED',
            retryAfterMs: 2000
          });
        case 'NETWORK_RESET':
          throw new GatewayError({
            kind: 'NETWORK',
            retryClass: 'RETRY',
            message: `Simulated ECONNRESET network error on gateway ${this.delegate.name}`,
            ambiguous: true,
            countsAgainstBreaker: true,
            gatewayCode: 'ECONNRESET'
          });
        case 'AUTH_ERROR':
          throw new GatewayError({
            kind: 'AUTH',
            retryClass: 'FALLBACK',
            message: `Simulated HTTP 401 Authentication Error on gateway ${this.delegate.name}`,
            ambiguous: false,
            countsAgainstBreaker: true,
            httpStatus: 401
          });
        case 'DECLINE':
          throw new GatewayError({
            kind: 'CARD_DECLINED',
            retryClass: 'TERMINAL',
            message: `Simulated Card Declined on gateway ${this.delegate.name}`,
            ambiguous: false,
            countsAgainstBreaker: false,
            httpStatus: 402,
            gatewayCode: 'card_declined'
          });
      }
    }

    return this.delegate.createPayment(input, ctx);
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | undefined>): VerifiedWebhookEvent {
    return this.delegate.verifyWebhook(rawBody, headers);
  }

  async fetchPaymentStatus(gatewayReference: string): Promise<NormalizedPaymentStatus> {
    return this.delegate.fetchPaymentStatus(gatewayReference);
  }
}
