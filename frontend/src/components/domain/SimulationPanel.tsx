import React, { useState } from 'react';
import { GatewayName, SimulationMode } from '@payroute/shared';
import { Card } from '../ui/Card.js';
import { Select } from '../ui/Select.js';
import { Input } from '../ui/Input.js';
import { Button } from '../ui/Button.js';
import { useToast } from '../ui/Toast.js';
import { AlertTriangle, Zap } from 'lucide-react';
import { useUpdateSimulation } from '../../api/hooks.js';

export interface SimulationPanelProps {
  className?: string;
}

export const SimulationPanel: React.FC<SimulationPanelProps> = ({ className }) => {
  const { toast } = useToast();
  const updateSimulationMutation = useUpdateSimulation();

  const [gateway, setGateway] = useState<GatewayName>('stripe');
  const [mode, setMode] = useState<SimulationMode>('HTTP_503');
  const [duration, setDuration] = useState('120');

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const durSec = parseInt(duration, 10);
      await updateSimulationMutation.mutateAsync({
        gateway,
        mode,
        durationSeconds: isNaN(durSec) ? 120 : durSec
      });
      toast('info', `Simulation updated: ${gateway.toUpperCase()} -> ${mode}`, `Active for ${duration} seconds`);
    } catch (err: any) {
      toast('error', 'Failed to update simulation', err.message, err.requestId);
    }
  };

  return (
    <Card
      title="Failure Injection & Circuit Demo Controls"
      subtitle="Dev/Demo control panel for injecting synthetic gateway faults to test retry, fallback, and circuit breaker behavior."
      className={className}
    >
      <form onSubmit={handleApply} className="space-y-3">
        <div className="p-2.5 bg-warning-subtle border border-warning/40 rounded text-xs text-warning-text flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
          <span>Demo Only: Synthetic errors bypass real network calls until expired or reset to NONE.</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select
            label="Target Gateway"
            value={gateway}
            onChange={(e) => setGateway(e.target.value as GatewayName)}
            options={[
              { value: 'stripe', label: 'STR (Stripe)' },
              { value: 'razorpay', label: 'RZP (Razorpay)' },
            ]}
          />

          <Select
            label="Fault Mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as SimulationMode)}
            options={[
              { value: 'NONE', label: 'NONE (Normal operation)' },
              { value: 'HTTP_503', label: 'HTTP_503 (Service Unavailable)' },
              { value: 'TIMEOUT', label: 'TIMEOUT (Gateway Timeout)' },
              { value: 'HTTP_429', label: 'HTTP_429 (Rate Limited)' },
              { value: 'NETWORK_RESET', label: 'NETWORK_RESET (ECONNRESET)' },
              { value: 'AUTH_ERROR', label: 'AUTH_ERROR (Invalid API Key)' },
              { value: 'DECLINE', label: 'DECLINE (Card Declined)' },
            ]}
          />

          <Input
            label="Duration (seconds)"
            type="number"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            min="1"
            max="900"
            required
          />
        </div>

        <div className="flex justify-end pt-1">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            icon={<Zap className="w-3.5 h-3.5" />}
            isLoading={updateSimulationMutation.isPending}
          >
            Apply Fault Injection
          </Button>
        </div>
      </form>
    </Card>
  );
};
