import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API_BASE = process.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
const STRIPE_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_dummy';
const RAZORPAY_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'dummy_webhook_secret';

function parseArgs() {
  const args = process.argv.slice(2);
  const options: Record<string, string> = {
    gateway: 'stripe',
    transaction: 'txn_01J9ZK3Q8M2V5T7R1B4N6C0XYD',
    type: 'succeeded',
    repeat: '1',
    'event-id': `evt_sim_${Math.random().toString(36).substring(2, 9)}`,
  };

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const val = args[i + 1];
    if (key && val) {
      options[key] = val;
    }
  }
  return options;
}

async function simulateWebhook() {
  const opts = parseArgs();
  const gateway = opts.gateway.toLowerCase();
  const txnId = opts.transaction;
  const eventType = opts.type.toLowerCase();
  const eventId = opts['event-id'];
  const repeatCount = parseInt(opts.repeat, 10) || 1;

  console.log(`\n🚀 Simulating Webhook: Gateway=${gateway.toUpperCase()}, EventID=${eventId}, Repeat=${repeatCount}x`);

  if (gateway === 'stripe') {
    const payload = JSON.stringify({
      id: eventId,
      object: 'event',
      api_version: '2024-04-10',
      created: Math.floor(Date.now() / 1000),
      type: eventType === 'succeeded' ? 'payment_intent.succeeded' : 'payment_intent.payment_failed',
      data: {
        object: {
          id: `pi_sim_${txnId.substring(4, 12)}`,
          object: 'payment_intent',
          amount: 49900,
          currency: 'inr',
          status: eventType === 'succeeded' ? 'succeeded' : 'requires_payment_method',
          metadata: {
            payroute_transaction_id: txnId,
          },
        },
      },
    });

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
      .createHmac('sha256', STRIPE_SECRET)
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    const stripeHeader = `t=${timestamp},v1=${signature}`;

    for (let i = 0; i < repeatCount; i++) {
      const res = await fetch(`${API_BASE}/webhooks/stripe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Stripe-Signature': stripeHeader,
        },
        body: payload,
      });

      const body = await res.json();
      console.log(`Deliver #${i + 1}: Status ${res.status}`, body);
    }
  } else if (gateway === 'razorpay') {
    const payload = JSON.stringify({
      entity: 'event',
      account_id: 'acc_demo123',
      event: eventType === 'succeeded' ? 'payment.captured' : 'payment.failed',
      contains: ['payment'],
      payload: {
        payment: {
          entity: {
            id: `pay_sim_${txnId.substring(4, 12)}`,
            entity: 'payment',
            amount: 49900,
            currency: 'INR',
            status: eventType === 'succeeded' ? 'captured' : 'failed',
            order_id: `order_sim_${txnId.substring(4, 12)}`,
            notes: {
              payroute_transaction_id: txnId,
            },
          },
        },
      },
      created_at: Math.floor(Date.now() / 1000),
    });

    const signature = crypto
      .createHmac('sha256', RAZORPAY_SECRET)
      .update(payload)
      .digest('hex');

    for (let i = 0; i < repeatCount; i++) {
      const res = await fetch(`${API_BASE}/webhooks/razorpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Razorpay-Signature': signature,
          'X-Razorpay-Event-Id': eventId,
        },
        body: payload,
      });

      const body = await res.json();
      console.log(`Deliver #${i + 1}: Status ${res.status}`, body);
    }
  }
}

simulateWebhook().catch((err) => {
  console.error('Webhook simulation failed:', err);
  process.exit(1);
});
