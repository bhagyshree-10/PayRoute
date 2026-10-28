import { z } from 'zod';
import {
  CURRENCIES,
  GATEWAY_NAMES,
  SIMULATION_MODES
} from './constants.js';

// Sensitive data guard helper
export function containsSensitiveCardData(val: unknown): boolean {
  if (typeof val === 'string') {
    // Check for 13 to 19 contiguous digits (ignoring spaces & dashes)
    const digitsOnly = val.replace(/[\s-]/g, '');
    if (/^\d{13,19}$/.test(digitsOnly)) {
      return true;
    }
  } else if (typeof val === 'object' && val !== null) {
    for (const [key, value] of Object.entries(val)) {
      const lowerKey = key.toLowerCase();
      if (
        ['card', 'number', 'pan', 'cvv', 'cvc', 'expiry', 'exp_month', 'exp_year'].some(
          (forbidden) => lowerKey.includes(forbidden)
        )
      ) {
        return true;
      }
      if (containsSensitiveCardData(value)) {
        return true;
      }
    }
  }
  return false;
}

export const PaymentCreateSchema = z
  .object({
    amount: z
      .number()
      .int()
      .min(100, 'Amount must be at least 100 minor units')
      .max(10000000, 'Amount cannot exceed 10,000,000 minor units'),
    currency: z
      .string()
      .transform((val) => val.toLowerCase())
      .pipe(z.enum(CURRENCIES, { errorMap: () => ({ message: 'Unsupported currency' }) })),
    description: z.string().max(200, 'Description max length is 200 characters').optional(),
    customer: z.object({
      reference: z
        .string()
        .min(1, 'Customer reference is required')
        .max(64, 'Customer reference max length is 64 characters')
        .regex(/^[A-Za-z0-9_-]+$/, 'Customer reference contains invalid characters')
    }),
    paymentMethod: z.object({
      type: z.literal('test_token'),
      token: z
        .string()
        .regex(/^pm_[A-Za-z0-9_]{3,64}$/, 'Invalid test payment token format')
        .optional()
    }),
    preferredGateway: z.enum(GATEWAY_NAMES).optional().nullable(),
    metadata: z
      .record(z.string().max(200, 'Metadata value max length is 200 characters'))
      .refine((val) => Object.keys(val).length <= 20, 'Metadata cannot exceed 20 key-value pairs')
      .optional()
  })
  .strict()
  .refine((data) => !containsSensitiveCardData(data), {
    message: 'SENSITIVE_DATA_REJECTED: Sensitive payment card details detected in request',
    path: ['body']
  });

export type PaymentCreateInput = z.infer<typeof PaymentCreateSchema>;

export const LoginSchema = z
  .object({
    email: z.string().email('Invalid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password max length is 128 characters')
  })
  .strict();

export type LoginInput = z.infer<typeof LoginSchema>;

export const SimulationUpdateSchema = z
  .object({
    gateway: z.enum(GATEWAY_NAMES),
    mode: z.enum(SIMULATION_MODES),
    durationSeconds: z.number().int().min(1).max(900)
  })
  .strict();

export type SimulationUpdateInput = z.infer<typeof SimulationUpdateSchema>;

export const GatewayPatchSchema = z
  .object({
    enabled: z.boolean()
  })
  .strict();

export type GatewayPatchInput = z.infer<typeof GatewayPatchSchema>;
