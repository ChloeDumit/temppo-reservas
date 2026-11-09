import type { Plan } from "@/generated/prisma/enums";
import { BEAUTY_PLANS, WA_PACK, type BeautyPlan } from "@/lib/brand/pricing";
import type { PaidPlan } from "./plans";

/*
  What a Temppo Beauty studio owes, and when — the rules from
  docs/plan-cobros.md, pure so they can be checked on their own:

  - after the trial, the plan she chose; if none, Equipo with more than one
    professional and Independiente with one;
  - launch pricing for the first studios, for a year;
  - a bigger plan applies at once, a smaller one from the next payment;
  - reminders three days before the due date, on the day, and three days
    late. Never more, and nothing is cut off: suspending stays a person's call.
*/

const DAY = 86_400_000;

export const BEAUTY_PLAN_ORDER: PaidPlan[] = ["ESSENTIAL", "STUDIO", "NETWORK"];

const KEY_FOR: Record<PaidPlan, BeautyPlan["key"]> = { ESSENTIAL: "solo", STUDIO: "team", NETWORK: "salon" };

export const BEAUTY_PLAN_NAMES: Record<PaidPlan, string> = {
  ESSENTIAL: "Independiente",
  STUDIO: "Equipo",
  NETWORK: "Salón",
};

export function beautyPlan(plan: PaidPlan): BeautyPlan & { plan: PaidPlan; name: string } {
  return { ...BEAUTY_PLANS.find((p) => p.key === KEY_FOR[plan])!, plan, name: BEAUTY_PLAN_NAMES[plan] };
}

/** A month of the plan, in cents of UYU. */
export function beautyPriceCents(plan: PaidPlan, launch: boolean) {
  const p = beautyPlan(plan);
  return (launch ? p.launchPriceUyu : p.priceUyu) * 100;
}

export const WA_PACK_CENTS = WA_PACK.priceUyu * 100;

/** Without a choice, the trial ends on the plan that fits her team. */
export function defaultPlanAfterTrial(professionals: number): PaidPlan {
  return professionals > 1 ? "STUDIO" : "ESSENTIAL";
}

export function isUpgrade(from: Plan, to: PaidPlan) {
  if (from === "TRIAL") return false;
  return BEAUTY_PLAN_ORDER.indexOf(to) > BEAUTY_PLAN_ORDER.indexOf(from);
}

/** Why she cannot move to this plan as she is today, or null. */
export function planLimitProblem(plan: PaidPlan, usage: { professionals: number; locations: number }): string | null {
  const p = beautyPlan(plan);
  if (p.professionals !== null && usage.professionals > p.professionals) {
    return `Tenés ${usage.professionals} profesionales cargadas: el plan ${p.name} incluye ${p.professionals === 1 ? "1" : `hasta ${p.professionals}`}.`;
  }
  if (p.locations !== null && usage.locations > p.locations) {
    return `Tenés ${usage.locations} sucursales: el plan ${p.name} incluye ${p.locations}.`;
  }
  return null;
}

export type BillingStudio = {
  plan: Plan;
  nextPlan: Plan | null;
  trialEndsAt: Date | null;
  suspendedAt: Date | null;
};

export type BillingSubscription = {
  status: string;
  provider: string | null;
  currentPeriodEnd: Date | null;
} | null;

/** What she pays for next: the plan the next payment buys. */
export function planToBill(studio: Pick<BillingStudio, "plan" | "nextPlan">, professionals: number): PaidPlan {
  if (studio.nextPlan && studio.nextPlan !== "TRIAL") return studio.nextPlan;
  if (studio.plan !== "TRIAL") return studio.plan;
  return defaultPlanAfterTrial(professionals);
}

/** True while a Mercado Pago auto-debit is charging her by itself. */
export function onAutoDebit(subscription: BillingSubscription) {
  return Boolean(subscription?.provider && subscription.status === "ACTIVE");
}

/** When the next payment is due: the end of the trial, or of the month paid. */
export function dueDate(studio: BillingStudio, subscription: BillingSubscription): Date | null {
  if (studio.plan === "TRIAL") return studio.trialEndsAt;
  return subscription?.currentPeriodEnd ?? null;
}

export type ReminderStage = 1 | 2 | 3;

/**
 * Which reminder is due now, or null: 1 from three days before, 2 from the
 * due date, 3 from three days after. Stages already sent for this date are
 * skipped, and a later one replaces an earlier one never sent (a studio found
 * late gets the late notice, not three at once).
 */
export function reminderDue(
  studio: BillingStudio & { billingRemindedFor: Date | null; billingReminderStage: number },
  subscription: BillingSubscription,
  now: Date,
): { stage: ReminderStage; dueAt: Date } | null {
  if (studio.suspendedAt || onAutoDebit(subscription)) return null;
  const dueAt = dueDate(studio, subscription);
  if (!dueAt) return null;

  const left = dueAt.getTime() - now.getTime();
  const stage: ReminderStage | 0 = left <= -3 * DAY ? 3 : left <= 0 ? 2 : left <= 3 * DAY ? 1 : 0;
  if (!stage) return null;
  // Long gone: nobody wants a reminder about a month ago.
  if (left < -30 * DAY) return null;

  const sent = studio.billingRemindedFor?.getTime() === dueAt.getTime() ? studio.billingReminderStage : 0;
  return stage > sent ? { stage, dueAt } : null;
}

export function daysLeft(dueAt: Date, now: Date) {
  return Math.ceil((dueAt.getTime() - now.getTime()) / DAY);
}
