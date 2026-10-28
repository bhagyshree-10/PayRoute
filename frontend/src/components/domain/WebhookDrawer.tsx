import React from 'react';
import { WebhookEvent } from '@payroute/shared';
import { Drawer } from '../ui/Drawer.js';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';
import { CopyableId } from '../ui/CopyableId.js';
import { KeyValue } from '../ui/KeyValue.js';
import { formatDate } from '../../lib/format.js';
import { getGatewayCode } from '../../lib/routeGlyph.js';
import { RotateCcw } from 'lucide-react';
import { useReprocessWebhook } from '../../api/hooks.js';
import { useToast } from '../ui/Toast.js';

export interface WebhookDrawerProps {
  webhook: WebhookEvent | null;
  isOpen: boolean;
  onClose: () => void;
}

export const WebhookDrawer: React.FC<WebhookDrawerProps> = ({ webhook, isOpen, onClose }) => {
  const { toast } = useToast();
  const reprocessMutation = useReprocessWebhook();

  if (!webhook) return null;

  const handleReprocess = async () => {
    try {
      await reprocessMutation.mutateAsync(webhook.id);
      toast('success', 'Webhook queued for reprocessing');
      onClose();
    } catch (err: any) {
      toast('error', 'Reprocess failed', err.message, err.requestId);
    }
  };

  const isReprocessable = webhook.status === 'FAILED' || webhook.status === 'ORPHANED';

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Webhook Delivery Details"
      subtitle={`Event ID: ${webhook.eventId}`}
      footer={
        isReprocessable ? (
          <Button
            variant="primary"
            size="sm"
            icon={<RotateCcw className="w-3.5 h-3.5" />}
            isLoading={reprocessMutation.isPending}
            onClick={handleReprocess}
          >
            Reprocess Webhook
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 p-3 bg-surface-muted rounded border border-border">
          <KeyValue label="Gateway" value={getGatewayCode(webhook.gateway)} mono />
          <KeyValue label="Event Type" value={webhook.eventType} mono />
          <KeyValue label="Status" value={<Badge variant={webhook.status === 'PROCESSED' ? 'success' : webhook.status === 'FAILED' ? 'error' : 'neutral'}>{webhook.status}</Badge>} />
          <KeyValue label="Duplicates Absorbed" value={webhook.duplicateCount.toString()} mono />
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-primary-dark uppercase">Metadata & Correlation</h4>
          <div className="space-y-1.5 text-xs font-mono bg-surface p-3 border border-border rounded">
            <div>
              <span className="text-text-secondary">Webhook Event ID: </span>
              <CopyableId id={webhook.id} truncate={false} />
            </div>
            <div>
              <span className="text-text-secondary">Matched Transaction: </span>
              {webhook.transactionId ? <CopyableId id={webhook.transactionId} truncate={false} /> : '-'}
            </div>
            <div>
              <span className="text-text-secondary">Matched Attempt: </span>
              {webhook.attemptId ? <CopyableId id={webhook.attemptId} truncate={false} /> : '-'}
            </div>
            <div>
              <span className="text-text-secondary">Raw Body SHA-256: </span>
              <CopyableId id={webhook.rawBodyHash} truncate={true} />
            </div>
          </div>
        </div>

        {webhook.lastError && (
          <div className="p-3 bg-error-subtle border border-error rounded text-xs text-error-text">
            <span className="font-semibold block mb-1">Processing Failure:</span>
            <p className="font-mono">{webhook.lastError}</p>
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-primary-dark uppercase">Payload Snapshot</h4>
          <pre className="p-3 bg-surface-muted text-text font-mono text-[11px] rounded border border-border overflow-x-auto max-h-60 leading-relaxed">
            {JSON.stringify(webhook.payloadSnapshot, null, 2)}
          </pre>
        </div>

        <div className="space-y-1 text-[11px] text-text-secondary border-t border-border pt-3">
          <div>Received: {formatDate(webhook.receivedAt)}</div>
          {webhook.processedAt && <div>Processed: {formatDate(webhook.processedAt)}</div>}
          {webhook.lastDuplicateAt && <div>Last Duplicate: {formatDate(webhook.lastDuplicateAt)}</div>}
        </div>
      </div>
    </Drawer>
  );
};
