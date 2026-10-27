import "server-only";
import { cookies } from "next/headers";
import type { Plan } from "@/generated/prisma/enums";
import { BEAUTY_PLANS, type BeautyPlan } from "@/lib/brand/pricing";

/*
  The platform console serves both products from the same URLs. Which one is
  on screen is a cookie, so every tab (and a reload) stays on the product the
  operator picked, without a parameter to thread through every link.
*/

export type AdminProduct = "temppo" | "beauty";

export const ADMIN_PRODUCT_COOKIE = "admin_product";

export async function getAdminProduct(): Promise<AdminProduct> {
  const store = await cookies();
  return store.get(ADMIN_PRODUCT_COOKIE)?.value === "beauty" ? "beauty" : "temppo";
}

export const PRODUCT_LABEL: Record<AdminProduct, string> = {
  temppo: "TEMPPO Reservas",
  beauty: "Temppo Beauty",
};

/**
 * Both products share the Plan enum; Beauty sells its tiers under its own
 * names. ESSENTIAL/STUDIO/NETWORK line up with Independiente/Equipo/Salón.
 */
const BEAUTY_PLAN_FOR: Record<Exclude<Plan, "TRIAL">, BeautyPlan["key"]> = {
  ESSENTIAL: "solo",
  STUDIO: "team",
  NETWORK: "salon",
};

const BEAUTY_PLAN_NAME: Record<BeautyPlan["key"], string> = {
  solo: "Independiente",
  team: "Equipo",
  salon: "Salón",
};

export function beautyPlanFor(plan: Exclude<Plan, "TRIAL">) {
  const key = BEAUTY_PLAN_FOR[plan];
  return { ...BEAUTY_PLANS.find((p) => p.key === key)!, name: BEAUTY_PLAN_NAME[key] };
}

/** How a plan reads for a studio of this brand. */
export function planLabel(brand: string, plan: Plan) {
  if (plan === "TRIAL") return brand === "beauty" ? "Prueba" : "TRIAL";
  return brand === "beauty" ? beautyPlanFor(plan).name : plan;
}
