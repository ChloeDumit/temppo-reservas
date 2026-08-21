import type { Plan } from "@/generated/prisma/enums";

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
 * ⚠️ PLACEHOLDER PRICES — set the real ones before pointing this at a live
 * Mercado Pago account.
 *
 * This is the only place a price is written down. The billing page, the
 * preapproval sent to Mercado Pago and the amount check on the incoming
 * webhook all read from here, so changing a number here changes all three.
 *
 * Monthly, in cents of PLATFORM_CURRENCY.
 */
export const PLAN_PRICE_CENTS: Record<PaidPlan, number> = {
  ESSENTIAL: 100_000, // UYU 1.000 — placeholder
  STUDIO: 200_000, // UYU 2.000 — placeholder
  NETWORK: 300_000, // UYU 3.000 — placeholder
};

export function planPriceCents(plan: PaidPlan) {
  return PLAN_PRICE_CENTS[plan];
}
