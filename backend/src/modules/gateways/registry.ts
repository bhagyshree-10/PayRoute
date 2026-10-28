import { GatewayName } from '@payroute/shared';
import { PaymentGateway } from './types.js';
import { StripeGateway } from './stripe.gateway.js';
import { RazorpayGateway } from './razorpay.gateway.js';
import { FailureInjectionGatewayWrapper } from './failureInjection.js';

class GatewayRegistryClass {
  private map: Map<GatewayName, PaymentGateway> = new Map();

  constructor() {
    const stripe = new StripeGateway();
    const razorpay = new RazorpayGateway();

    this.map.set('stripe', new FailureInjectionGatewayWrapper(stripe));
    this.map.set('razorpay', new FailureInjectionGatewayWrapper(razorpay));
  }

  getGateway(name: GatewayName): PaymentGateway {
    const gw = this.map.get(name);
    if (!gw) {
      throw new Error(`Payment gateway '${name}' is not registered`);
    }
    return gw;
  }

  getAllGateways(): PaymentGateway[] {
    return Array.from(this.map.values());
  }

  registerGateway(gw: PaymentGateway): void {
    this.map.set(gw.name, gw);
  }
}

export const GatewayRegistry = new GatewayRegistryClass();
