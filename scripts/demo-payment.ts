import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API_BASE = process.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

function parseArgs() {
  const args = process.argv.slice(2);
  const options: Record<string, string> = {
    amount: '49900',
    currency: 'inr',
    'idempotency-key': `demo-key-${Math.random().toString(36).substring(2, 9)}`,
    key: process.env.DEMO_API_KEY || 'pr_test_demo_api_key_placeholder',
  };

  for (let i = 0; i < args.length; i += 2) {
    const k = args[i].replace(/^--/, '');
    const v = args[i + 1];
    if (k && v) {
      options[k] = v;
    }
  }
  return options;
}

async function demoPayment() {
  const opts = parseArgs();
  const amount = parseInt(opts.amount, 10);
  const currency = opts.currency;
  const idempotencyKey = opts['idempotency-key'];
  const apiKey = opts.key;

  console.log(`\n💳 Creating Payment: Amount=${amount} ${currency.toUpperCase()}, Idempotency-Key=${idempotencyKey}`);

  const res = await fetch(`${API_BASE}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      amount,
      currency,
      customer: { reference: 'cust_cli_demo' },
      paymentMethod: { type: 'test_token', token: 'pm_card_visa' },
      description: 'CLI Demo Payment Request',
    }),
  });

  const body = await res.json();
  const isReplayed = res.headers.get('Idempotent-Replayed');

  console.log(`Response HTTP Status: ${res.status}${isReplayed ? ' (Idempotent Replay: true)' : ''}`);
  console.log(JSON.stringify(body, null, 2));
}

demoPayment().catch((err) => {
  console.error('Demo payment failed:', err);
  process.exit(1);
});
