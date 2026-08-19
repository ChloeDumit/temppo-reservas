import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  CheckoutRequest,
  CheckoutSession,
  PaymentProvider,
  ProviderPayment,
  ProviderPaymentStatus,
} from "./types";

const API = "https://api.mercadopago.com";

/**
 * Verifies the `x-signature` header Mercado Pago sends with each webhook.
 *
 * The manifest is fixed by them as: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 * Returns true when no secret is configured — the webhook handler re-reads the
 * payment from the API regardless, so an unsigned setup is still safe, just
 * noisier.
 */
export function verifyMercadoPagoSignature(params: {
  signatureHeader: string | null;
  requestIdHeader: string | null;
  dataId: string | null;
}): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!params.signatureHeader || !params.dataId) return false;

  // Header looks like: ts=1704908010,v1=abc123...
  const parts = Object.fromEntries(
    params.signatureHeader.split(",").map((chunk) => {
      const [key, ...rest] = chunk.trim().split("=");
      return [key, rest.join("=")];
    }),
  );

  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const manifest = `id:${params.dataId.toLowerCase()};request-id:${params.requestIdHeader ?? ""};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(v1, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function mapStatus(status: string): ProviderPaymentStatus {
  switch (status) {
    case "approved":
      return "APPROVED";
    case "refunded":
    case "charged_back":
      return "REFUNDED";
    case "rejected":
    case "cancelled":
      return "REJECTED";
    default:
      return "PENDING";
  }
}

export const mercadoPago: PaymentProvider = {
  name: "mercadopago",

  isConfigured() {
    return Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN);
  },

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN is not set");

    const res = await fetch(`${API}/checkout/preferences`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [
          {
            title: request.title,
            quantity: 1,
            currency_id: request.currency,
            unit_price: request.amountCents / 100,
          },
        ],
        payer: { email: request.payerEmail },
        // Our own id comes back on the webhook, which is how we match it up.
        external_reference: request.studentPackId,
        back_urls: {
          success: request.successUrl,
          failure: request.failureUrl,
          pending: request.successUrl,
        },
        auto_return: "approved",
        notification_url: request.notificationUrl,
      }),
    });

    if (!res.ok) {
      throw new Error(`Mercado Pago preference failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as {
      id: string;
      init_point?: string;
      sandbox_init_point?: string;
    };

    const redirectUrl =
      process.env.NODE_ENV === "production"
        ? data.init_point
        : (data.sandbox_init_point ?? data.init_point);

    if (!redirectUrl) throw new Error("Mercado Pago returned no checkout URL");

    return { redirectUrl, providerReference: data.id };
  },

  /**
   * Webhooks only carry an id, never an amount or status we can trust, so the
   * payment is always re-fetched from the API before we act on it.
   */
  async resolveWebhook(payload: unknown): Promise<ProviderPayment | null> {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) return null;

    const body = payload as {
      type?: string;
      action?: string;
      data?: { id?: string | number };
    };

    const isPayment = body.type === "payment" || body.action?.startsWith("payment.");
    const paymentId = body.data?.id;
    if (!isPayment || !paymentId) return null;

    const res = await fetch(`${API}/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;

    const payment = (await res.json()) as {
      id: number;
      status: string;
      transaction_amount: number;
      external_reference?: string | null;
    };

    return {
      providerPaymentId: String(payment.id),
      status: mapStatus(payment.status),
      amountCents: Math.round(payment.transaction_amount * 100),
      externalReference: payment.external_reference ?? null,
    };
  },
};
