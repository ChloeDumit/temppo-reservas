import "server-only";
import { verifyMercadoPagoSignature } from "@/lib/payments/mercadopago";

const API = "https://api.mercadopago.com";

/**
 * Mercado Pago, seen from the platform's side of the till.
 *
 * Kept separate from src/lib/payments, which spends the token of whoever
 * collects money from students. The two stay distinct in the code even when
 * they resolve to the same credentials, so the day a studio connects its own
 * Mercado Pago account, only one of them has to change.
 *
 * The fallback exists because Mercado Pago allows one webhook URL per
 * application: running both flows through a single application is a legitimate
 * setup, and it means one token and one signing key. Set the PLATFORM_ vars
 * only when subscriptions live in an application of their own.
 */
function platformToken() {
  return process.env.MERCADOPAGO_PLATFORM_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN || "";
}

/** False means the manual (transfer) path is the only way to collect. */
export function isSubscriptionBillingConfigured() {
  return Boolean(platformToken());
}

export function verifyBillingSignature(params: {
  signatureHeader: string | null;
  requestIdHeader: string | null;
  dataId: string | null;
}) {
  return verifyMercadoPagoSignature({
    ...params,
    secret:
      process.env.MERCADOPAGO_PLATFORM_WEBHOOK_SECRET || process.env.MERCADOPAGO_WEBHOOK_SECRET,
  });
}

async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
  const token = platformToken();
  if (!token) return null;

  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    console.error(`[billing] ${init?.method ?? "GET"} ${path} → ${res.status} ${await res.text()}`);
    return null;
  }

  return (await res.json()) as T;
}

/**
 * What a webhook body is actually about.
 *
 * Mercado Pago names these three ways at once: the dashboard event is "Planes
 * y suscripciones", the docs call the topic "preapproval", and what arrives on
 * the wire is type "subscription_preapproval" plus an `entity` field. The wire
 * format is the only one that matters, and it has already disagreed with the
 * docs once, so every spelling maps to the same answer.
 */
export type BillingTopic = "preapproval" | "authorizedPayment" | null;

export function resolveBillingTopic(body: {
  type?: string;
  entity?: string;
  action?: string;
}): BillingTopic {
  const raw = body.type ?? body.entity ?? body.action?.split(".")[0];

  if (raw === "subscription_preapproval" || raw === "preapproval") return "preapproval";
  if (raw === "subscription_authorized_payment") return "authorizedPayment";
  return null;
}

export type PreapprovalStatus = "PENDING" | "ACTIVE" | "PAUSED" | "CANCELLED";

export type Preapproval = {
  id: string;
  status: PreapprovalStatus;
  /** Our Subscription id, round-tripped through the provider. */
  externalReference: string | null;
  amountCents: number;
  currency: string;
  nextPaymentAt: Date | null;
  /** Where to send the owner to authorise the card. Only on creation. */
  initPoint: string | null;
};

type RawPreapproval = {
  id: string;
  status?: string;
  external_reference?: string | null;
  next_payment_date?: string | null;
  init_point?: string | null;
  auto_recurring?: { transaction_amount?: number; currency_id?: string };
};

function mapPreapprovalStatus(status: string | undefined): PreapprovalStatus {
  switch (status) {
    case "authorized":
      return "ACTIVE";
    case "paused":
      return "PAUSED";
    case "cancelled":
      return "CANCELLED";
    default:
      return "PENDING";
  }
}

function toPreapproval(raw: RawPreapproval): Preapproval {
  return {
    id: String(raw.id),
    status: mapPreapprovalStatus(raw.status),
    externalReference: raw.external_reference ?? null,
    amountCents: Math.round((raw.auto_recurring?.transaction_amount ?? 0) * 100),
    currency: raw.auto_recurring?.currency_id ?? "",
    nextPaymentAt: raw.next_payment_date ? new Date(raw.next_payment_date) : null,
    initPoint: raw.init_point ?? null,
  };
}

/**
 * Opens a monthly auto-debit authorisation.
 *
 * Created as "pending": Mercado Pago only starts charging once the owner has
 * entered a card at init_point, and the `preapproval` webhook is what tells us
 * they did. Nothing is marked active on this side until then.
 */
export async function createPreapproval(params: {
  subscriptionId: string;
  reason: string;
  payerEmail: string;
  amountCents: number;
  currency: string;
  backUrl: string;
}): Promise<Preapproval | null> {
  const raw = await call<RawPreapproval>("/preapproval", {
    method: "POST",
    body: JSON.stringify({
      reason: params.reason,
      external_reference: params.subscriptionId,
      payer_email: params.payerEmail,
      back_url: params.backUrl,
      status: "pending",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: params.amountCents / 100,
        currency_id: params.currency,
      },
    }),
  });

  return raw ? toPreapproval(raw) : null;
}

export async function getPreapproval(id: string): Promise<Preapproval | null> {
  const raw = await call<RawPreapproval>(`/preapproval/${id}`);
  return raw ? toPreapproval(raw) : null;
}

export async function cancelPreapproval(id: string): Promise<boolean> {
  const raw = await call<RawPreapproval>(`/preapproval/${id}`, {
    method: "PUT",
    body: JSON.stringify({ status: "cancelled" }),
  });
  return raw !== null;
}

export type AuthorizedPayment = {
  id: string;
  preapprovalId: string | null;
  /** Reuses the studio-side vocabulary: a charge either landed or it didn't. */
  status: "PENDING" | "APPROVED" | "REJECTED";
  amountCents: number;
  currency: string;
  paidAt: Date | null;
};

type RawAuthorizedPayment = {
  id: string | number;
  preapproval_id?: string | null;
  status?: string;
  transaction_amount?: number;
  currency_id?: string;
  debit_date?: string | null;
  payment?: { id?: number; status?: string } | null;
};

/**
 * One month's charge against a preapproval.
 *
 * Two statuses matter and they disagree often: the scheduling status (was it
 * attempted?) and the payment's own (did the card go through?). Only the second
 * one is money, so a "processed" schedule with a rejected payment counts as a
 * failure.
 */
export async function getAuthorizedPayment(id: string): Promise<AuthorizedPayment | null> {
  const raw = await call<RawAuthorizedPayment>(`/authorized_payments/${id}`);
  if (!raw) return null;

  const paymentStatus = raw.payment?.status;
  const status: AuthorizedPayment["status"] =
    paymentStatus === "approved"
      ? "APPROVED"
      : paymentStatus === "rejected" || paymentStatus === "cancelled" || raw.status === "cancelled"
        ? "REJECTED"
        : "PENDING";

  return {
    id: String(raw.id),
    preapprovalId: raw.preapproval_id ?? null,
    status,
    amountCents: Math.round((raw.transaction_amount ?? 0) * 100),
    currency: raw.currency_id ?? "",
    paidAt: status === "APPROVED" && raw.debit_date ? new Date(raw.debit_date) : null,
  };
}
