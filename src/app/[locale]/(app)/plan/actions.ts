"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getLocale } from "next-intl/server";
import { assertUser, inSupportVisit } from "@/lib/auth/guards";
import { localePath } from "@/i18n/routing";
import { appUrlFor } from "@/lib/brand/url";
import { brandByKey } from "@/lib/brand/registry";
import { startAutoDebit, type PaidPlan } from "@/lib/billing";
import { billingSummary, choosePlan, startPlatformCheckout } from "@/lib/billing/beauty-server";

const PAGE = "/[locale]/(app)/plan";

async function back(message: string): Promise<never> {
  const locale = await getLocale();
  redirect(`${localePath(locale, "/plan")}?m=${encodeURIComponent(message)}`);
}

/** The owner of a Temppo Beauty studio. Money is never moved during a support visit. */
async function assertBeautyOwner({ money = false } = {}) {
  const user = await assertUser();
  if (user.role !== "OWNER" || user.studio.brand !== "beauty") return null;
  if (money && (await inSupportVisit())) return null;
  return user;
}

const planSchema = z.enum(["ESSENTIAL", "STUDIO", "NETWORK"]);

export async function choosePlanAction(formData: FormData) {
  const user = await assertBeautyOwner();
  if (!user) return back("Solo la dueña del negocio puede cambiar el plan.");
  const plan = planSchema.safeParse(formData.get("plan"));
  if (!plan.success) return back("Elegí un plan.");
  const result = await choosePlan(user.studioId, plan.data as PaidPlan, { id: user.id, name: user.name });
  revalidatePath(PAGE, "page");
  if ("error" in result) return back(result.error);
  return back(
    result.applied === "now"
      ? "¡Listo! Ya estás en el plan nuevo. El precio nuevo se cobra en tu próximo pago."
      : user.studio.plan === "TRIAL"
        ? "¡Listo! Ese es tu plan para cuando termine la prueba."
        : "¡Listo! Pasás a ese plan desde tu próximo pago.",
  );
}

export async function payAction(formData: FormData) {
  const user = await assertBeautyOwner({ money: true });
  if (!user) return back("Solo la dueña del negocio puede pagar, y no durante una visita de soporte.");
  if (!user.email) return back("Tu cuenta no tiene email: pagá por transferencia.");
  const purpose = formData.get("purpose") === "WA_PACK" ? "WA_PACK" : "PLAN";
  const result = await startPlatformCheckout({ studioId: user.studioId, purpose, payerEmail: user.email });
  if ("error" in result) return back(result.error);
  redirect(result.redirectUrl);
}

export async function autoDebitAction() {
  const user = await assertBeautyOwner({ money: true });
  if (!user) return back("Solo la dueña del negocio puede activar el débito automático.");
  if (!user.email) return back("Tu cuenta no tiene email: Mercado Pago lo necesita.");
  const summary = await billingSummary(user.studioId);
  const result = await startAutoDebit({
    studioId: user.studioId,
    plan: summary.billPlan.plan,
    payerEmail: user.email,
    studioName: user.studio.name,
    backUrl: `${appUrlFor(user.studio)}${localePath(user.studio.locale, "/plan")}`,
    amountCents: summary.amountCents,
    productName: brandByKey(user.studio.brand).name,
  });
  if ("error" in result) return back("No pudimos abrir Mercado Pago. Probá de nuevo en un rato o pagá mes a mes.");
  redirect(result.redirectUrl);
}
