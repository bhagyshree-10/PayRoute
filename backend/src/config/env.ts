import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  MONGODB_URI: z.string().default('mongodb://localhost:27017'),
  MONGODB_DB: z.string().default('payroute'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  STRIPE_SECRET_KEY: z
    .string()
    .refine((val) => !val.startsWith('sk_live_'), {
      message: 'CRITICAL SECURITY: Live Stripe credentials (sk_live_) are strictly forbidden in PayRoute test mode!'
    })
    .default('sk_test_dummy'),
  STRIPE_WEBHOOK_SECRET: z.string().default('whsec_dummy'),

  RAZORPAY_KEY_ID: z
    .string()
    .refine((val) => !val.startsWith('rzp_live_'), {
      message: 'CRITICAL SECURITY: Live Razorpay credentials (rzp_live_) are strictly forbidden in PayRoute test mode!'
    })
    .default('rzp_test_dummy'),
  RAZORPAY_KEY_SECRET: z.string().default('dummy_secret'),
  RAZORPAY_WEBHOOK_SECRET: z.string().default('dummy_webhook_secret'),

  PRIMARY_GATEWAY: z.enum(['stripe', 'razorpay']).default('stripe'),
  PAYMENT_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  RETRY_INITIAL_DELAY_MS: z.coerce.number().int().min(100).max(10000).default(1000),
  GATEWAY_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(8000),
  CIRCUIT_BREAKER_THRESHOLD: z.coerce.number().int().min(2).max(20).default(5),
  CIRCUIT_BREAKER_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600000).default(30000),
  WEBHOOK_TOLERANCE_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  IDEMPOTENCY_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  RECONCILE_AFTER_MS: z.coerce.number().int().min(10000).default(600000),
  WEBHOOK_RETENTION_DAYS: z.coerce.number().int().min(7).max(365).default(90),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long').default('replace_with_at_least_32_random_characters_long_secret'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  ADMIN_SEED_EMAIL: z.string().email().default('admin@example.com'),
  ADMIN_SEED_PASSWORD: z.string().min(8).default('admin123456'),

  ENABLE_FAILURE_INJECTION: z
    .string()
    .transform((val) => val === 'true')
    .default('true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variable configuration:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
