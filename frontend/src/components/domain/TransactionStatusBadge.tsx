import React from 'react';
import { TransactionStatus } from '@payroute/shared';
import { Badge, BadgeVariant } from '../ui/Badge.js';
import {
  CircleDashed,
  Loader2,
  RotateCcw,
  Clock,
  Check,
  X,
  Ban
} from 'lucide-react';

export interface TransactionStatusBadgeProps {
  status: TransactionStatus;
  className?: string;
}

export const TransactionStatusBadge: React.FC<TransactionStatusBadgeProps> = ({ status, className }) => {
  let variant: BadgeVariant = 'neutral';
  let label: string = status;
  let icon = <CircleDashed className="w-3 h-3" />;

  switch (status) {
    case 'CREATED':
      variant = 'neutral';
      icon = <CircleDashed className="w-3 h-3" />;
      break;
    case 'PROCESSING':
      variant = 'in-progress';
      icon = <Loader2 className="w-3 h-3 animate-spin" />;
      break;
    case 'RETRYING':
      variant = 'warning';
      icon = <RotateCcw className="w-3 h-3 animate-spin" />;
      break;
    case 'AWAITING_CONFIRMATION':
      variant = 'outline';
      label = 'AWAITING';
      icon = <Clock className="w-3 h-3" />;
      break;
    case 'SUCCESS':
      variant = 'success';
      icon = <Check className="w-3 h-3" />;
      break;
    case 'FAILED':
      variant = 'error';
      icon = <X className="w-3 h-3" />;
      break;
    case 'CANCELLED':
      variant = 'neutral';
      icon = <Ban className="w-3 h-3" />;
      break;
  }

  return (
    <Badge variant={variant} icon={icon} className={className}>
      {label}
    </Badge>
  );
};
