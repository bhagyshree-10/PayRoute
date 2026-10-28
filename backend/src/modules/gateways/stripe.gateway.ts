import crypto from 'crypto';
import Stripe from 'stripe';
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

export class StripeGateway implements PaymentGateway {
  readonly name = 'stripe' as const;
  readonly supportedCurrencies = ['usd', 'inr', 'eur', 'gbp'];
  private stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-04-10',
    });
  }

  async createPayment(input: GatewayPaymentInput, ctx: GatewayCallContext): Promise<GatewayPaymentResult> {
    const t0 = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ctx.timeoutMs);

    try {
      const intent = await this.stripe.paymentIntents.create(
        {
          amount: input.amount,
          currency: input.currency.toLowerCase(),
          confirm: true,
          payment_method: input.paymentMethodToken || 'pm_card_visa',
          return_url: 'https://payroute.local/complete',
          metadata: {
            payroute_transaction_id: ctx.transactionId,
            payroute_attempt_id: ctx.correlationAttemptId,
            ...(input.metadata || {}),
          },
        },
        {
          idempotencyKey: ctx.gatewayIdempotencyKey,
        }
      );

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - t0;

      return {
        outcome: 'ACCEPTED',
        gatewayReference: intent.id,
        gatewayStatus: intent.status,
        latencyMs,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - t0;
      const c = classify(err);

      throw new GatewayError({
        kind: c.kind,
        retryClass: c.retryClass,
        message: err.message || 'Stripe API call failed',
        ambiguous: c.ambiguous,
        countsAgainstBreaker: c.countsAgainstBreaker,
        httpStatus: err.statusCode || err.status || c.httpStatus,
        gatewayCode: err.code || c.gatewayCode,
      });
    }
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | undefined>): VerifiedWebhookEvent {
    const sig = headers['stripe-signature'];
    if (!sig) {
      throw new GatewayError({
        kind: 'AUTH',
        retryClass: 'TERMINAL',
        message: 'Missing Stripe-Signature header',
        countsAgainstBreaker: false,
        httpStatus: 400
      });
    }

    try {
      const event = this.stripe.webhooks.constructEvent(
        rawBody,
        sig,
        env.STRIPE_WEBHOOK_SECRET,
        env.WEBHOOK_TOLERANCE_SECONDS
      );

      const rawBodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
      const dataObj = (event.data?.object as any) || {};

      const payloadSnapshot = {
        id: event.id,
        type: event.type,
        object_id: dataObj.id,
        status: dataObj.status,
        amount: dataObj.amount,
        currency: dataObj.currency,
        metadata: dataObj.metadata || {},
        error: dataObj.last_payment_error
          ? { code: dataObj.last_payment_error.code, message: dataObj.last_payment_error.message }
          : null,
      };

      return {
        gateway: 'stripe',
        eventId: event.id,
        eventType: event.type,
        payloadSnapshot,
        rawBodyHash,
      };
    } catch (err: any) {
      throw new GatewayError({
        kind: 'AUTH',
        retryClass: 'TERMINAL',
        message: `Stripe webhook signature verification failed: ${err.message}`,
        countsAgainstBreaker: false,
        httpStatus: 400
      });
    }
  }

  async fetchPaymentStatus(gatewayReference: string): Promise<NormalizedPaymentStatus> {
    try {
      const intent = await this.stripe.paymentIntents.retrieve(gatewayReference);
      let outcome: 'SUCCEEDED' | 'FAILED' | 'AWAITING_CONFIRMATION' = 'AWAITING_CONFIRMATION';

      if (intent.status === 'succeeded') {
        outcome = 'SUCCEEDED';
      } else if (intent.status === 'canceled' || intent.status === 'requires_payment_method') {
        outcome = 'FAILED';
      }

      return {
        gatewayStatus: intent.status,
        outcome,
        gatewayReference: intent.id,
      };
    } catch (err: any) {
      const c = classify(err);
      throw new GatewayError({
        kind: c.kind,
        retryClass: c.retryClass,
        message: `Failed to fetch Stripe status for ${gatewayReference}: ${err.message}`,
        countsAgainstBreaker: false,
      });
    }
  }
}
