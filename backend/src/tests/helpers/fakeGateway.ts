import {
  GatewayCallContext,
  GatewayPaymentInput,
  GatewayPaymentResult,
  NormalizedPaymentStatus,
  PaymentGateway,
  VerifiedWebhookEvent,
  GatewayError
} from '../../modules/gateways/types.js';
import { GatewayName } from '@payroute/shared';

export class FakeGateway implements PaymentGateway {
  readonly supportedCurrencies = ['usd', 'inr', 'eur', 'gbp'];
  public calls: Array<{ input: GatewayPaymentInput; ctx: GatewayCallContext }> = [];
  public scriptedResponses: Array<GatewayPaymentResult | GatewayError> = [];

  constructor(public readonly name: GatewayName = 'stripe') {}

  enqueueResponse(response: GatewayPaymentResult | GatewayError): void {
    this.scriptedResponses.push(response);
  }

  async createPayment(input: GatewayPaymentInput, ctx: GatewayCallContext): Promise<GatewayPaymentResult> {
    this.calls.push({ input, ctx });

    const nextRes = this.scriptedResponses.shift();
    if (!nextRes) {
      // Default success response
      return {
        outcome: 'ACCEPTED',
        gatewayReference: `ref_fake_${this.name}_${Date.now()}`,
        gatewayStatus: 'accepted',
        latencyMs: 120,
      };
    }

    if (nextRes instanceof GatewayError) {
      throw nextRes;
    }

    return nextRes;
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | undefined>): VerifiedWebhookEvent {
    const bodyStr = rawBody.toString('utf8');
    const parsed = JSON.parse(bodyStr);

    return {
      gateway: this.name,
      eventId: parsed.id || `evt_fake_${Date.now()}`,
      eventType: parsed.type || 'payment_intent.succeeded',
      payloadSnapshot: parsed,
      rawBodyHash: 'fake_hash_123',
    };
  }

  async fetchPaymentStatus(gatewayReference: string): Promise<NormalizedPaymentStatus> {
    return {
      gatewayStatus: 'succeeded',
      outcome: 'SUCCEEDED',
      gatewayReference,
    };
  }
}
