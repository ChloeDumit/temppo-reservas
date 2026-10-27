/**
 * Provider-agnostic payment surface. Adding a second processor means writing
 * one more object of this shape — nothing above this layer changes.
 */
export type CheckoutRequest = {
  studioId: string;
  /** What this pays for, as built by paymentRef() — "pack:…" or "appt:…". */
  externalReference: string;
  title: string;
  amountCents: number;
  currency: string;
  /** Providers require one; a student with no email pays in person instead. */
  payerEmail: string;
  /** Where the provider sends the payer back to. */
  successUrl: string;
  failureUrl: string;
  notificationUrl: string;
  /**
   * Charge into this account instead of the platform's — a studio's own
   * Mercado Pago, connected through OAuth.
   */
  accessToken?: string;
  /** The platform's cut of a payment charged into a studio's account. */
  marketplaceFeeCents?: number;
  /**
   * After this the checkout no longer takes payment — a deposit is held for
   * minutes, and money arriving for a slot already released helps nobody.
   * Also limits payment to methods that settle at once (no cash vouchers).
   */
  expiresAt?: Date;
};

export type CheckoutSession = {
  /** Where to send the payer to complete the payment. */
  redirectUrl: string;
  providerReference: string;
};

export type ProviderPaymentStatus = "PENDING" | "APPROVED" | "REJECTED" | "REFUNDED";

export type ProviderPayment = {
  providerPaymentId: string;
  status: ProviderPaymentStatus;
  amountCents: number;
  /** Our paymentRef(), round-tripped through the provider. */
  externalReference: string | null;
};

export interface PaymentProvider {
  readonly name: string;
  isConfigured(): boolean;
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  /**
   * Reads a webhook body and fetches the authoritative payment state, with
   * the account it was charged into when that is not the platform's.
   */
  resolveWebhook(payload: unknown, accessToken?: string): Promise<ProviderPayment | null>;
}
