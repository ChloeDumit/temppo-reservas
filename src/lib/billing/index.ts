import "server-only";
import { db } from "@/lib/db";
import type { Plan, SubscriptionStatus } from "@/generated/prisma/enums";
import { addMonths } from "@/lib/dates";
import {
  isPaidPlan,
  planPriceCents,
  PLATFORM_CURRENCY,
  type PaidPlan,
} from "./plans";
import {
  cancelPreapproval,
  createPreapproval,
  getAuthorizedPayment,
  getPreapproval,
  isSubscriptionBillingConfigured,
} from "./mercadopago";

export * from "./plans";
export {
  isSubscriptionBillingConfigured,
  resolveBillingTopic,
  verifyBillingSignature,
} from "./mercadopago";

const PROVIDER = "mercadopago";

export function subscriptionFor(studioId: string) {
  return db.subscription.findUnique({ where: { studioId } });
}

export function chargesFor(studioId: string, take = 12) {
  return db.subscriptionCharge.findMany({
    where: { studioId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

/**
 * Starts (or re-points) a studio's monthly auto-debit.
 *
 * The Subscription row is written before Mercado Pago is called, because the
 * preapproval carries its id as external_reference — that id is the only thing
 * tying an incoming webhook back to a studio.
 */
export async function startAutoDebit(params: {
  studioId: string;
  plan: PaidPlan;
  payerEmail: string;
  studioName: string;
  backUrl: string;
}): Promise<{ redirectUrl: string } | { error: "notConfigured" | "providerFailed" }> {
  if (!isSubscriptionBillingConfigured()) return { error: "notConfigured" };

  const amountCents = planPriceCents(params.plan);

  const existing = await db.subscription.findUnique({ where: { studioId: params.studioId } });

  // Changing plans means a new authorisation; the old one must not keep charging.
  if (existing?.providerRef && existing.status !== "CANCELLED") {
    await cancelPreapproval(existing.providerRef);
  }

  const subscription = await db.subscription.upsert({
    where: { studioId: params.studioId },
    create: {
      studioId: params.studioId,
      plan: params.plan as Plan,
      status: "PENDING",
      amountCents,
      currency: PLATFORM_CURRENCY,
      provider: PROVIDER,
    },
    update: {
      plan: params.plan as Plan,
      status: "PENDING",
      amountCents,
      currency: PLATFORM_CURRENCY,
      provider: PROVIDER,
      providerRef: null,
      cancelledAt: null,
    },
  });

  const preapproval = await createPreapproval({
    subscriptionId: subscription.id,
    reason: `TEMPPO Reservas — ${params.studioName}`,
    payerEmail: params.payerEmail,
    amountCents,
    currency: PLATFORM_CURRENCY,
    backUrl: params.backUrl,
  });

  if (!preapproval?.initPoint) return { error: "providerFailed" };

  await db.subscription.update({
    where: { id: subscription.id },
    data: { providerRef: preapproval.id },
  });

  return { redirectUrl: preapproval.initPoint };
}

function mapStatus(status: "PENDING" | "ACTIVE" | "PAUSED" | "CANCELLED"): SubscriptionStatus {
  return status;
}

/**
 * Reconciles one preapproval against our copy.
 *
 * Called from the webhook, but safe to call at any time — the provider is the
 * source of truth for whether an authorisation is live, so this only ever
 * copies their answer down.
 */
export async function syncPreapproval(preapprovalId: string): Promise<boolean> {
  const preapproval = await getPreapproval(preapprovalId);
  if (!preapproval) return false;

  // external_reference is ours; providerRef is the fallback for a row written
  // before the id came back.
  const subscription = preapproval.externalReference
    ? await db.subscription.findUnique({ where: { id: preapproval.externalReference } })
    : await db.subscription.findUnique({ where: { providerRef: preapproval.id } });

  if (!subscription) return false;

  const status = mapStatus(preapproval.status);

  await db.subscription.update({
    where: { id: subscription.id },
    data: {
      status,
      providerRef: preapproval.id,
      currentPeriodEnd: preapproval.nextPaymentAt ?? subscription.currentPeriodEnd,
      cancelledAt: status === "CANCELLED" ? (subscription.cancelledAt ?? new Date()) : null,
    },
  });

  /*
    The plan on the Studio is what the rest of the app reads, so it only moves
    once money is actually authorised. A lapse never moves it back — that call
    belongs to a person, from the platform console.
  */
  if (status === "ACTIVE") {
    await db.studio.update({
      where: { id: subscription.studioId },
      data: { plan: subscription.plan },
    });
  }

  return true;
}

/**
 * Records one month's automatic charge.
 *
 * Idempotent on the provider's payment id: Mercado Pago retries a webhook until
 * it gets a 200, and a retry must not bill the studio's history twice.
 */
export async function recordAuthorizedPayment(authorizedPaymentId: string): Promise<boolean> {
  const charge = await getAuthorizedPayment(authorizedPaymentId);
  if (!charge?.preapprovalId) return false;

  const subscription = await db.subscription.findUnique({
    where: { providerRef: charge.preapprovalId },
  });
  if (!subscription) return false;

  const existing = await db.subscriptionCharge.findUnique({
    where: { providerPaymentId: charge.id },
  });
  if (existing?.status === "APPROVED") return true;

  const now = new Date();

  await db.subscriptionCharge.upsert({
    where: { providerPaymentId: charge.id },
    create: {
      subscriptionId: subscription.id,
      studioId: subscription.studioId,
      amountCents: charge.amountCents,
      currency: charge.currency || subscription.currency,
      method: "MERCADO_PAGO",
      status: charge.status,
      provider: PROVIDER,
      providerPaymentId: charge.id,
      paidAt: charge.paidAt,
    },
    update: { status: charge.status, paidAt: charge.paidAt },
  });

  if (charge.status === "APPROVED") {
    // Extend from wherever the studio was paid up to, not from today, so a late
    // charge doesn't quietly shorten the month it paid for.
    const from =
      subscription.currentPeriodEnd && subscription.currentPeriodEnd > now
        ? subscription.currentPeriodEnd
        : now;

    await db.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "ACTIVE",
        lastPaymentAt: charge.paidAt ?? now,
        currentPeriodEnd: addMonths(from, 1),
      },
    });

    await db.studio.update({
      where: { id: subscription.studioId },
      data: { plan: subscription.plan },
    });
  } else if (charge.status === "REJECTED") {
    // Flag it and stop. Nothing is suspended automatically: a failed card is
    // usually a card, not a customer leaving, and Mercado Pago retries.
    await db.subscription.update({
      where: { id: subscription.id },
      data: { status: "PAST_DUE" },
    });
  }

  return true;
}

export async function cancelAutoDebit(studioId: string): Promise<boolean> {
  const subscription = await db.subscription.findUnique({ where: { studioId } });
  if (!subscription) return false;

  if (subscription.providerRef) await cancelPreapproval(subscription.providerRef);

  await db.subscription.update({
    where: { id: subscription.id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  return true;
}

/**
 * The manual fallback: a studio that paid by transfer or in cash.
 *
 * Recorded by a platform admin, never by the studio itself, and it deliberately
 * carries no provider — nothing will renew it, so someone has to come back next
 * month. That friction is the point: it keeps the manual path visibly manual.
 */
export async function recordManualCharge(params: {
  studioId: string;
  plan: PaidPlan;
  amountCents: number;
  months: number;
  note?: string | null;
  recordedById: string;
}): Promise<boolean> {
  if (!isPaidPlan(params.plan) || params.months < 1 || params.amountCents < 0) return false;

  const now = new Date();

  const subscription = await db.subscription.upsert({
    where: { studioId: params.studioId },
    create: {
      studioId: params.studioId,
      plan: params.plan as Plan,
      status: "ACTIVE",
      amountCents: params.amountCents,
      currency: PLATFORM_CURRENCY,
      lastPaymentAt: now,
      currentPeriodEnd: addMonths(now, params.months),
    },
    update: {},
  });

  const from =
    subscription.currentPeriodEnd && subscription.currentPeriodEnd > now
      ? subscription.currentPeriodEnd
      : now;

  await db.$transaction([
    db.subscriptionCharge.create({
      data: {
        subscriptionId: subscription.id,
        studioId: params.studioId,
        amountCents: params.amountCents,
        currency: PLATFORM_CURRENCY,
        method: "BANK_TRANSFER",
        status: "APPROVED",
        note: params.note ?? null,
        recordedById: params.recordedById,
        paidAt: now,
      },
    }),
    db.subscription.update({
      where: { id: subscription.id },
      data: {
        plan: params.plan as Plan,
        status: "ACTIVE",
        amountCents: params.amountCents,
        lastPaymentAt: now,
        currentPeriodEnd: addMonths(from, params.months),
        cancelledAt: null,
      },
    }),
    db.studio.update({
      where: { id: params.studioId },
      data: { plan: params.plan as Plan },
    }),
  ]);

  return true;
}

export type BillingWarning = "trialEnding" | "trialExpired" | "pastDue" | "cancelled" | null;

/**
 * What, if anything, the owner needs to be told. Nothing here cuts anyone off:
 * every one of these is a banner, and suspension stays a manual call made from
 * the platform console.
 */
export function billingWarning(
  studio: { plan: Plan; trialEndsAt: Date | null },
  subscription: { status: SubscriptionStatus; currentPeriodEnd: Date | null } | null,
  now = new Date(),
): BillingWarning {
  if (subscription?.status === "PAST_DUE") return "pastDue";
  if (subscription?.status === "CANCELLED") return "cancelled";
  if (subscription?.status === "ACTIVE") return null;

  if (studio.plan === "TRIAL" && studio.trialEndsAt) {
    const daysLeft = Math.ceil((studio.trialEndsAt.getTime() - now.getTime()) / 86_400_000);
    if (daysLeft <= 0) return "trialExpired";
    if (daysLeft <= 7) return "trialEnding";
  }

  return null;
}
