import "server-only";
import { mercadoPago, verifyMercadoPagoSignature } from "./mercadopago";
import type { PaymentProvider } from "./types";

export type * from "./types";

const PROVIDERS: Record<string, PaymentProvider> = {
  mercadopago: mercadoPago,
};

/** The studio's processor. One entry today; the map is the extension point. */
export function paymentProvider(name = process.env.PAYMENT_PROVIDER || "mercadopago") {
  return PROVIDERS[name] ?? mercadoPago;
}

export function isOnlinePaymentEnabled() {
  return paymentProvider().isConfigured();
}

export { verifyMercadoPagoSignature };
