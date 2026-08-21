"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertUser } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { cancelAutoDebit, isPaidPlan, startAutoDebit, type PaidPlan } from "@/lib/billing";
import { localePath } from "@/i18n/routing";

export type BillingState = {
  error?: "forbidden" | "notConfigured" | "noEmail" | "providerFailed" | "generic";
} | null;

const planSchema = z.object({ plan: z.enum(["ESSENTIAL", "STUDIO", "NETWORK"]) });

/** Only the owner signs the studio up for a bill. */
async function assertOwner() {
  const user = await assertUser();
  return user.role === "OWNER" ? user : null;
}

export async function startSubscriptionAction(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const user = await assertOwner();
  if (!user) return { error: "forbidden" };

  const parsed = planSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || !isPaidPlan(parsed.data.plan)) return { error: "generic" };

  // Mercado Pago needs somewhere to send the receipt and the authorisation.
  if (!user.email) return { error: "noEmail" };

  const base = process.env.APP_URL || "http://localhost:3000";

  const result = await startAutoDebit({
    studioId: user.studioId,
    plan: parsed.data.plan as PaidPlan,
    payerEmail: user.email,
    studioName: user.studio.name,
    backUrl: `${base}${localePath(user.studio.locale, "/billing")}`,
  });

  if ("error" in result) return { error: result.error };

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "billing.subscription_start",
    entityType: "Subscription",
    entityId: user.studioId,
    metadata: { plan: parsed.data.plan },
  });

  // Off to Mercado Pago to authorise the card. Nothing is active until the
  // preapproval webhook says it is.
  redirect(result.redirectUrl);
}

export async function cancelSubscriptionAction(
  _prev: BillingState,
  _formData: FormData,
): Promise<BillingState> {
  const user = await assertOwner();
  if (!user) return { error: "forbidden" };

  const ok = await cancelAutoDebit(user.studioId);
  if (!ok) return { error: "generic" };

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "billing.subscription_cancel",
    entityType: "Subscription",
    entityId: user.studioId,
  });

  revalidatePath("/[locale]/(app)/billing", "page");
  return null;
}
