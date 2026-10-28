import crypto from 'crypto';
import Razorpay from 'razorpay';
import { env } from '../../config/env.js';
import {
  GatewayCallContext,
  GatewayPaymentInput,
  GatewayPaymentResult,
  NormalizedPaymentStatus,
  PaymentGateway,
  VerifiedWebhookEvent,
  GatewayError
} from './types.js';
import { classify } from '../retry/classify.js';

export class RazorpayGateway implements PaymentGateway {
  readonly name = 'razorpay' as const;
  readonly supportedCurrencies = ['inr'];
  private razorpay: Razorpay;

  constructor() {
    this.razorpay = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });
  }

  async createPayment(input: GatewayPaymentInput, ctx: GatewayCallContext): Promise<GatewayPaymentResult> {
    const t0 = Date.now();

    try {
      // Create Razorpay Order
      const order = await this.razorpay.orders.create({
        amount: input.amount,
        currency: input.currency.toUpperCase(),
        receipt: ctx.transactionId,
        notes: {
          payroute_transaction_id: ctx.transactionId,
          payroute_attempt_id: ctx.correlationAttemptId,
          ...(input.metadata || {}),
        },
      });

      const latencyMs = Date.now() - t0;

      return {
        outcome: 'ACCEPTED',
        gatewayReference: order.id,
        gatewayStatus: order.status,
        latencyMs,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - t0;
      const c = classify(err);

      throw new GatewayError({
        kind: c.kind,
        retryClass: c.retryClass,
        message: err.error?.description || err.message || 'Razorpay API call failed',
        ambiguous: c.ambiguous,
        countsAgainstBreaker: c.countsAgainstBreaker,
        httpStatus: err.statusCode || c.httpStatus,
        gatewayCode: err.error?.code || c.gatewayCode,
      });
    }
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | undefined>): VerifiedWebhookEvent {
    const sig = headers['x-razorpay-signature'];
    const eventIdHeader = headers['x-razorpay-event-id'];

    if (!sig) {
      throw new GatewayError({
        kind: 'AUTH',
        retryClass: 'TERMINAL',
        message: 'Missing X-Razorpay-Signature header',
        countsAgainstBreaker: false,
        httpStatus: 400
      });
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
        .update(rawBody)
        .digest('hex');

      const sigBuffer = Buffer.from(sig, 'utf8');
      const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

      if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
        throw new Error('HMAC signature mismatch');
      }

      const bodyJson = JSON.parse(rawBody.toString('utf8'));
      const eventId = eventIdHeader || bodyJson.event_id || bodyJson.id || `whe_rzp_${Date.now()}`;
      const eventType = bodyJson.event || 'payment.captured';
      const rawBodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');

      const entity = bodyJson.payload?.payment?.entity || bodyJson.payload?.order?.entity || {};

      const payloadSnapshot = {
        id: eventId,
        event: eventType,
        order_id: entity.order_id || entity.id,
        payment_id: entity.id,
        amount: entity.amount,
        currency: entity.currency,
        notes: entity.notes || {},
        error: entity.error_description ? { code: entity.error_code, message: entity.error_description } : null,
      };

      return {
        gateway: 'razorpay',
        eventId,
        eventType,
        payloadSnapshot,
        rawBodyHash,
      };
    } catch (err: any) {
      throw new GatewayError({
        kind: 'AUTH',
        retryClass: 'TERMINAL',
        message: `Razorpay webhook signature verification failed: ${err.message}`,
        countsAgainstBreaker: false,
        httpStatus: 400
      });
    }
  }

  async fetchPaymentStatus(gatewayReference: string): Promise<NormalizedPaymentStatus> {
    try {
      const order = await this.razorpay.orders.fetch(gatewayReference);
      let outcome: 'SUCCEEDED' | 'FAILED' | 'AWAITING_CONFIRMATION' = 'AWAITING_CONFIRMATION';

      if (order.status === 'paid') {
        outcome = 'SUCCEEDED';
      } else if (order.status === 'attempted' || order.status === 'created') {
        outcome = 'AWAITING_CONFIRMATION';
      }

      return {
        gatewayStatus: order.status,
        outcome,
        gatewayReference: order.id,
      };
    } catch (err: any) {
      const c = classify(err);
      throw new GatewayError({
        kind: c.kind,
        retryClass: c.retryClass,
        message: `Failed to fetch Razorpay status for ${gatewayReference}: ${err.message}`,
        countsAgainstBreaker: false,
      });
    }
  }
}
