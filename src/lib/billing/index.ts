import "server-only";
import { db } from "@/lib/db";
import type { Plan, SubscriptionStatus } from "@/generated/prisma/enums";
import { addMonths } from "@/lib/dates";
import {
  extendedPeriodEnd,
  isPaidPlan,
  PLAN_PRICE_CENTS,
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

  const amountCents = await planPriceCents(params.plan);

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
      months: 1,
      provider: PROVIDER,
      providerPaymentId: charge.id,
      paidAt: charge.paidAt,
    },
    update: { status: charge.status, paidAt: charge.paidAt },
  });

  if (charge.status === "APPROVED") {
    await db.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "ACTIVE",
        lastPaymentAt: charge.paidAt ?? now,
        currentPeriodEnd: extendedPeriodEnd(subscription.currentPeriodEnd, 1, now),
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

  /*
    Created without a paid-through date on purpose. The update below is the one
    place the months are added, and setting them here as well granted a new
    studio twice what it paid for — three months bought, six months given.
  */
  const subscription = await db.subscription.upsert({
    where: { studioId: params.studioId },
    create: {
      studioId: params.studioId,
      plan: params.plan as Plan,
      status: "ACTIVE",
      amountCents: params.amountCents,
      currency: PLATFORM_CURRENCY,
    },
    update: {},
  });

  await db.$transaction([
    db.subscriptionCharge.create({
      data: {
        subscriptionId: subscription.id,
        studioId: params.studioId,
        amountCents: params.amountCents,
        currency: PLATFORM_CURRENCY,
        method: "BANK_TRANSFER",
        status: "APPROVED",
        months: params.months,
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
        currentPeriodEnd: extendedPeriodEnd(subscription.currentPeriodEnd, params.months, now),
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

/**
 * What each plan costs right now: the console's prices, falling back to the
 * code defaults for any plan nobody has priced yet.
 *
 * Everything that quotes or charges money goes through here — the billing page,
 * the preapproval sent to Mercado Pago, and the manual charge in the console —
 * so a price changed in one place is the price everywhere.
 */
export async function planPrices(): Promise<Record<PaidPlan, number>> {
  const rows = await db.planPrice.findMany();
  const prices = { ...PLAN_PRICE_CENTS };

  for (const row of rows) {
    if (isPaidPlan(row.plan) && row.amountCents > 0) prices[row.plan] = row.amountCents;
  }

  return prices;
}

export async function planPriceCents(plan: PaidPlan): Promise<number> {
  return (await planPrices())[plan];
}

export async function setPlanPrice(plan: PaidPlan, amountCents: number, updatedById: string) {
  await db.planPrice.upsert({
    where: { plan: plan as Plan },
    create: { plan: plan as Plan, amountCents, updatedById },
    update: { amountCents, updatedById },
  });
}

/**
 * Undoes a manual charge that should never have been booked.
 *
 * Manual entry without a way back is a one-way door: a typo in the amount or
 * the wrong studio is only correctable if the time it bought can be handed
 * back, which is what `months` on the charge is for. The row is marked refunded
 * rather than deleted — the money either moved or it did not, and erasing the
 * record would lose that either way.
 *
 * Automatic charges are left alone: those are Mercado Pago's to reverse, and
 * marking one refunded here would only make our copy disagree with theirs.
 */
export async function voidManualCharge(chargeId: string): Promise<boolean> {
  const charge = await db.subscriptionCharge.findUnique({
    where: { id: chargeId },
    include: { subscription: true },
  });

  if (!charge || charge.method !== "BANK_TRANSFER" || charge.status !== "APPROVED") return false;

  await db.$transaction([
    db.subscriptionCharge.update({
      where: { id: charge.id },
      data: { status: "REFUNDED" },
    }),
    db.subscription.update({
      where: { id: charge.subscriptionId },
      data: {
        currentPeriodEnd: charge.subscription.currentPeriodEnd
          ? addMonths(charge.subscription.currentPeriodEnd, -charge.months)
          : null,
      },
    }),
  ]);

  return true;
}

/** Every charge across every studio, newest first. The platform's ledger. */
export function allCharges(take = 100) {
  return db.subscriptionCharge.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: { subscription: { include: { studio: { select: { id: true, name: true } } } } },
  });
}

/** Live subscriptions, for the recurring-revenue figure. */
export function activeSubscriptions() {
  return db.subscription.findMany({
    where: { status: "ACTIVE" },
    include: { studio: { select: { id: true, name: true } } },
    orderBy: { currentPeriodEnd: "asc" },
  });
}

/**
 * Studios that need chasing: a charge that failed, or a paid-through date that
 * has quietly passed. The second is the one a status field alone would miss —
 * a manual studio never fails a charge, it just stops paying.
 */
export function subscriptionsNeedingAttention(now = new Date()) {
  return db.subscription.findMany({
    where: {
      OR: [
        { status: "PAST_DUE" },
        { status: { in: ["ACTIVE", "PAUSED"] }, currentPeriodEnd: { lt: now } },
      ],
    },
    include: { studio: { select: { id: true, name: true, suspendedAt: true } } },
    orderBy: { currentPeriodEnd: "asc" },
  });
}
