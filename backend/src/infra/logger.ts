import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      "req.headers['x-api-key']",
      "req.headers['stripe-signature']",
      "req.headers['x-razorpay-signature']",
      '*.password',
      '*.token',
      '*.secret',
      '*.apiKey',
      'body.paymentMethod'
    ],
    censor: '[REDACTED]'
  },
  base: {
    service: 'payroute'
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function sanitizeErrorMessage(message: string): string {
  if (!message) return '';
  // Remove 13-19 digit runs (card-like numbers)
  const sanitized = message.replace(/\b\d{13,19}\b/g, '[REDACTED_CARD]');
  return sanitized.substring(0, 300);
}
