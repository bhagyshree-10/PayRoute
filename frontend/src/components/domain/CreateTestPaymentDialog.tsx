import React, { useState, useEffect } from 'react';
import { Dialog } from '../ui/Dialog.js';
import { Input } from '../ui/Input.js';
import { Select } from '../ui/Select.js';
import { Button } from '../ui/Button.js';
import { useToast } from '../ui/Toast.js';
import { RefreshCw, Play } from 'lucide-react';
import { useCreateTestPayment } from '../../api/hooks.js';

export interface CreateTestPaymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateTestPaymentDialog: React.FC<CreateTestPaymentDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const { toast } = useToast();
  const createPaymentMutation = useCreateTestPayment();

  const generateIdempotencyKey = () => `idem-demo-${Math.random().toString(36).substring(2, 10)}`;

  const [amount, setAmount] = useState('49900');
  const [currency, setCurrency] = useState('inr');
  const [customerRef, setCustomerRef] = useState('cust_demo_101');
  const [preferredGateway, setPreferredGateway] = useState('');
  const [token, setToken] = useState('pm_card_visa');
  const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey());
  const [lastUsedKey, setLastUsedKey] = useState<string | null>(null);
  const [reusePreviousKey, setReusePreviousKey] = useState(false);

  useEffect(() => {
    if (isOpen && !reusePreviousKey) {
      setIdempotencyKey(generateIdempotencyKey());
    }
  }, [isOpen]);

  const handleToggleReuseKey = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setReusePreviousKey(checked);
    if (checked && lastUsedKey) {
      setIdempotencyKey(lastUsedKey);
    } else {
      setIdempotencyKey(generateIdempotencyKey());
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const numAmount = parseInt(amount, 10);
      if (isNaN(numAmount) || numAmount < 100) {
        toast('error', 'Invalid amount', 'Amount must be an integer >= 100 minor units');
        return;
      }

      const res = await createPaymentMutation.mutateAsync({
        amount: numAmount,
        currency,
        customerReference: customerRef,
        preferredGateway: preferredGateway || undefined,
        idempotencyKey,
        token
      });

      setLastUsedKey(idempotencyKey);
      toast('success', 'Test payment submitted (202 Accepted)', `Transaction ID: ${res.id}`);
      onClose();
    } catch (err: any) {
      toast('error', err.code || 'Payment Submission Failed', err.message, err.requestId);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Create Test Payment"
      subtitle="Submit an idempotent test payment request through PayRoute orchestration API."
      width="480"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Amount (minor units)"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            hint="e.g. 49900 = 499.00"
            required
          />
          <Select
            label="Currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            options={[
              { value: 'inr', label: 'INR (Indian Rupee)' },
              { value: 'usd', label: 'USD (US Dollar)' },
              { value: 'eur', label: 'EUR (Euro)' },
              { value: 'gbp', label: 'GBP (British Pound)' },
            ]}
          />
        </div>

        <Input
          label="Customer Reference"
          value={customerRef}
          onChange={(e) => setCustomerRef(e.target.value)}
          required
        />

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Preferred Gateway (Optional)"
            value={preferredGateway}
            onChange={(e) => setPreferredGateway(e.target.value)}
            options={[
              { value: '', label: 'Auto (Primary Gateway)' },
              { value: 'stripe', label: 'Stripe' },
              { value: 'razorpay', label: 'Razorpay' },
            ]}
          />
          <Input
            label="Test Token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
          />
        </div>

        <div className="p-3 bg-surface-muted border border-border rounded space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">Idempotency-Key Header:</span>
            <button
              type="button"
              onClick={() => setIdempotencyKey(generateIdempotencyKey())}
              disabled={reusePreviousKey}
              className="text-[11px] text-primary hover:underline flex items-center gap-1 disabled:opacity-40"
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>
          <Input
            value={idempotencyKey}
            onChange={(e) => setIdempotencyKey(e.target.value)}
            disabled={reusePreviousKey}
            className="font-mono text-xs"
            required
          />

          <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={reusePreviousKey}
              onChange={handleToggleReuseKey}
              disabled={!lastUsedKey}
              className="rounded text-primary focus:ring-primary h-3.5 w-3.5"
            />
            <span className="text-xs text-text-secondary">
              Reuse previous key for idempotency demo ({lastUsedKey ? 'Available' : 'No previous key yet'})
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            icon={<Play className="w-3.5 h-3.5" />}
            isLoading={createPaymentMutation.isPending}
          >
            Submit Payment (202)
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
