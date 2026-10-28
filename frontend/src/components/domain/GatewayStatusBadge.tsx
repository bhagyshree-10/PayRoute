import React from 'react';
import { HealthStatus } from '@payroute/shared';
import { Badge, BadgeVariant } from '../ui/Badge.js';
import { CheckCircle2, AlertTriangle, OctagonX, Activity } from 'lucide-react';

export interface GatewayStatusBadgeProps {
  status: HealthStatus;
  className?: string;
}

export const GatewayStatusBadge: React.FC<GatewayStatusBadgeProps> = ({ status, className }) => {
  let variant: BadgeVariant = 'neutral';
  let icon = <CheckCircle2 className="w-3 h-3" />;

  switch (status) {
    case 'HEALTHY':
      variant = 'success';
      icon = <CheckCircle2 className="w-3 h-3" />;
      break;
    case 'DEGRADED':
      variant = 'warning';
      icon = <AlertTriangle className="w-3 h-3" />;
      break;
    case 'DOWN':
      variant = 'error';
      icon = <OctagonX className="w-3 h-3" />;
      break;
    case 'RECOVERING':
      variant = 'in-progress';
      icon = <Activity className="w-3 h-3" />;
      break;
  }

  return (
    <Badge variant={variant} icon={icon} className={className}>
      {status}
    </Badge>
  );
};
