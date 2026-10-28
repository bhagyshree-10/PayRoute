import { GatewayName } from '@payroute/shared';

/**
 * Format gateway name to neutral short code
 */
export function getGatewayCode(gatewayName?: string | null): string {
  if (!gatewayName) return '?';
  const lower = gatewayName.toLowerCase();
  if (lower === 'stripe') return 'STR';
  if (lower === 'razorpay') return 'RZP';
  return gatewayName.substring(0, 3).toUpperCase();
}

/**
 * Derives route glyph string from array of attempts or gateway codes
 * e.g. [{gateway: 'stripe'}, {gateway: 'stripe'}, {gateway: 'razorpay'}] -> "STR > STR > RZP"
 */
export function deriveRouteGlyph(
  attempts?: Array<{ gateway: GatewayName }> | string[] | null
): string {
  if (!attempts || attempts.length === 0) {
    return 'NONE';
  }

  const codes = attempts.map((item) => {
    if (typeof item === 'string') {
      return getGatewayCode(item);
    }
    return getGatewayCode(item.gateway);
  });

  return codes.join(' > ');
}
