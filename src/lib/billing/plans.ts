import type { Plan } from "@/generated/prisma/enums";
import { addMonths } from "@/lib/dates";

/** Every plan a studio can actually pay for. TRIAL is a state, not a product. */
export type PaidPlan = Exclude<Plan, "TRIAL">;

export const PAID_PLANS = ["ESSENTIAL", "STUDIO", "NETWORK"] as const;

export function isPaidPlan(plan: string): plan is PaidPlan {
  return (PAID_PLANS as readonly string[]).includes(plan);
}

/**
 * TEMPPO bills in one currency regardless of what a studio charges its own
 * students — a Uruguayan studio pricing packs in UYU and an Argentine one in
 * ARS still owe us the same number.
 */
export const PLATFORM_CURRENCY = "UYU";

/**
 * Fallback prices, monthly, in cents of PLATFORM_CURRENCY.
 *
 * These are what a plan costs until the platform console says otherwise — the
 * PlanPrice table overrides them. They stay in code as the floor so an empty
 * table, a fresh database or a failed query can never leave the platform unable
 * to quote a price.
 *
 * ⚠️ Still placeholders. Set real ones in the console, or here for a new
 * deployment's starting point.
 */
export const PLAN_PRICE_CENTS: Record<PaidPlan, number> = {
  ESSENTIAL: 100_000, // UYU 1.000 — placeholder
  STUDIO: 200_000, // UYU 2.000 — placeholder
  NETWORK: 300_000, // UYU 3.000 — placeholder
};

/** Synchronous fallback. Prefer `planPrices()`, which reads the console's values. */
export function defaultPlanPriceCents(plan: PaidPlan) {
  return PLAN_PRICE_CENTS[plan];
}

/**
 * Where a subscription is paid through after buying `months` more.
 *
 * Extends from whatever the studio had left rather than from today, so a late
 * renewal doesn't quietly cost them the days they already paid for — and a
 * lapsed one starts from today rather than back-filling a gap nobody was owed.
 *
 * Pure, and the single place this arithmetic happens: doing it in two spots is
 * how a first manual charge once granted double the months it was paid for.
 */
export function extendedPeriodEnd(
  currentPeriodEnd: Date | null,
  months: number,
  now: Date,
): Date {
  const from = currentPeriodEnd && currentPeriodEnd > now ? currentPeriodEnd : now;
  return addMonths(from, months);
}

/**
 * Whether studios see the subscription UI at all.
 *
 * Off while TEMPPO is still in its own trial phase: nobody is being charged
 * yet, so a "choose a plan" tab and a "your trial is ending" banner both offer
 * a decision the studio cannot act on, and invite questions we do not want to
 * answer yet.
 *
 * The /billing route itself stays reachable by URL, so the whole flow can be
 * exercised before it is announced. Flip this to true to launch — nothing else
 * needs to change.
 */
export const BILLING_UI_ENABLED = false;
