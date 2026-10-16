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
  /** Reads a webhook body and fetches the authoritative payment state. */
  resolveWebhook(payload: unknown): Promise<ProviderPayment | null>;
}
