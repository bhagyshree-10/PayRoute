import { describe, it, expect } from 'vitest';
import { PaymentCreateSchema, containsSensitiveCardData } from '@payroute/shared';

describe('T01 - Payment Creation Validation & PCI Guard Unit Tests', () => {
  it('validates valid test payment input successfully', () => {
    const valid = {
      amount: 49900,
      currency: 'INR',
      description: 'Order #1024 subscription',
      customer: { reference: 'cust_valid_123' },
      paymentMethod: { type: 'test_token', token: 'pm_card_visa' },
      metadata: { orderId: 'ord_123' },
    };

    const parsed = PaymentCreateSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.currency).toBe('inr'); // normalized to lowercase
      expect(parsed.data.amount).toBe(49900);
    }
  });

  it('rejects payment inputs below minimum amount or invalid currency', () => {
    const belowMin = {
      amount: 50, // min is 100
      currency: 'inr',
      customer: { reference: 'cust_1' },
      paymentMethod: { type: 'test_token' },
    };
    expect(PaymentCreateSchema.safeParse(belowMin).success).toBe(false);

    const badCurrency = {
      amount: 5000,
      currency: 'XYZ', // unsupported
      customer: { reference: 'cust_1' },
      paymentMethod: { type: 'test_token' },
    };
    expect(PaymentCreateSchema.safeParse(badCurrency).success).toBe(false);
  });

  it('detects and rejects sensitive payment card credentials (PCI Guard)', () => {
    // Attempting to submit raw PAN
    expect(containsSensitiveCardData('4111111111111111')).toBe(true);
    expect(containsSensitiveCardData({ card_number: '4111 2222 3333 4444' })).toBe(true);
    expect(containsSensitiveCardData({ cvv: '123' })).toBe(true);

    const sensitiveInput = {
      amount: 1000,
      currency: 'usd',
      customer: { reference: 'cust_1' },
      paymentMethod: { type: 'test_token' },
      metadata: { pan: '4111111111111111' }
    };
    expect(PaymentCreateSchema.safeParse(sensitiveInput).success).toBe(false);
  });
});
