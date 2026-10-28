import React from 'react';
import { GatewayName } from '@payroute/shared';
import { deriveRouteGlyph } from '../../lib/routeGlyph.js';
import { cn } from '../../lib/cn.js';

export interface RouteGlyphProps {
  attempts?: Array<{ gateway: GatewayName }> | string[] | null;
  className?: string;
}

export const RouteGlyph: React.FC<RouteGlyphProps> = ({ attempts, className }) => {
  const glyph = deriveRouteGlyph(attempts);

  return (
    <span className={cn('font-mono text-xs font-medium text-text-secondary tabular-nums', className)}>
      {glyph}
    </span>
  );
};
