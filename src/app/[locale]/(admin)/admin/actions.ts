"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertPlatformAdmin } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { localePath } from "@/i18n/routing";
import {
  PAID_PLANS,
  planPriceCents,
  recordManualCharge,
  setPlanPrice,
  voidManualCharge,
} from "@/lib/billing";
import { slugify } from "@/lib/slug";
import { parseMoneyToCents } from "@/lib/money";
import type { Plan } from "@/generated/prisma/enums";

/**
 * Platform-level actions.
 *
 * Every one of these reaches across tenants, so each re-checks the platform
 * flag rather than trusting the page that rendered the button, and each writes
 * an audit row against the studio it touched.
 */

/*
  How every console action ends.

  revalidatePath alone was not enough: it clears the server's copy, but the page
  that submitted the form kept rendering the client router's cached one, so a
  plan written to the database still showed the old value on screen — which
  reads as "the button does nothing". Redirecting back to the page the form
  declared forces a real render, and is also what puts the operator's eye back
  on the value they just changed.

  `returnTo` comes from the form rather than the referer so it cannot be aimed
  somewhere else, and it is pattern-checked anyway.
*/
const RETURN_TO = /^\/admin(\/[A-Za-z0-9_-]+)*$/;

async function finishAdminAction(returnTo: unknown): Promise<never> {
  revalidatePath("/", "layout");

  const path = typeof returnTo === "string" && RETURN_TO.test(returnTo) ? returnTo : "/admin";
  redirect(localePath(await getLocale(), path));
}

const planSchema = z.object({
  studioId: z.string().min(1),
  plan: z.enum(["TRIAL", "ESSENTIAL", "STUDIO", "NETWORK"]),
});

export async function setPlanAction(formData: FormData) {
  const admin = await assertPlatformAdmin();
  const parsed = planSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const studio = await db.studio.findUnique({ where: { id: parsed.data.studioId } });
  if (!studio) return;

  await db.studio.update({
    where: { id: studio.id },
    data: { plan: parsed.data.plan as Plan },
  });

  await recordAudit({
    studioId: studio.id,
    actorId: admin.id,
    actorLabel: `${admin.name} (plataforma)`,
    action: "platform.plan_change",
    entityType: "Studio",
    entityId: studio.id,
    metadata: { from: studio.plan, to: parsed.data.plan },
  });

  await finishAdminAction(formData.get("returnTo"));
}

/** Pushes a trial out by a number of days from today. */
export async function extendTrialAction(formData: FormData) {
  const admin = await assertPlatformAdmin();
  const studioId = String(formData.get("studioId") ?? "");
  const days = Number(formData.get("days") ?? 0);

  if (!studioId || !Number.isFinite(days) || days <= 0 || days > 365) return;

  const studio = await db.studio.findUnique({ where: { id: studioId } });
  if (!studio) return;

  // Extend from whichever is later, so extending an active trial adds to it
  // rather than shortening it.
  const base =
    studio.trialEndsAt && studio.trialEndsAt > new Date() ? studio.trialEndsAt : new Date();
  const trialEndsAt = new Date(base.getTime() + days * 86_400_000);

  await db.studio.update({ where: { id: studioId }, data: { trialEndsAt } });

  await recordAudit({
    studioId,
    actorId: admin.id,
    actorLabel: `${admin.name} (plataforma)`,
    action: "platform.trial_extend",
    entityType: "Studio",
    entityId: studioId,
    metadata: { days, until: trialEndsAt.toISOString() },
  });

  await finishAdminAction(formData.get("returnTo"));
}

/** Suspending cuts off access without deleting anything. */
export async function toggleSuspendAction(formData: FormData) {
  const admin = await assertPlatformAdmin();
  const studioId = String(formData.get("studioId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);

  const studio = await db.studio.findUnique({ where: { id: studioId } });
  if (!studio) return;

  const suspending = studio.suspendedAt === null;

  await db.studio.update({
    where: { id: studioId },
    data: {
      suspendedAt: suspending ? new Date() : null,
      suspendedReason: suspending ? reason || null : null,
    },
  });

  // Sessions are checked on every request, so revoking them is belt and
  // braces — but it ends any open tab immediately rather than on next nav.
  if (suspending) {
    await db.session.deleteMany({ where: { user: { studioId } } });
  }

  await recordAudit({
    studioId,
    actorId: admin.id,
    actorLabel: `${admin.name} (plataforma)`,
    action: suspending ? "platform.suspend" : "platform.unsuspend",
    entityType: "Studio",
    entityId: studioId,
    metadata: { reason: reason || null },
  });

  await finishAdminAction(formData.get("returnTo"));
}

export async function toggleUserActiveAction(formData: FormData) {
  const admin = await assertPlatformAdmin();
  const userId = String(formData.get("userId") ?? "");

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return;

  // Never let the console lock out the operator using it.
  if (user.id === admin.id) return;

  await db.user.update({ where: { id: userId }, data: { isActive: !user.isActive } });
  if (user.isActive) await db.session.deleteMany({ where: { userId } });

  await recordAudit({
    studioId: user.studioId,
    actorId: admin.id,
    actorLabel: `${admin.name} (plataforma)`,
    action: user.isActive ? "platform.user_disable" : "platform.user_enable",
    entityType: "User",
    entityId: userId,
    metadata: { email: user.email },
  });

  await finishAdminAction(formData.get("returnTo"));
}

const manualChargeSchema = z.object({
  studioId: z.string().min(1),
  plan: z.enum(["ESSENTIAL", "STUDIO", "NETWORK"]),
  /// Blank means "the list price" — the common case, and the one where a typo
  /// in a thousands separator would otherwise book the wrong number silently.
  amount: z.string().trim().optional(),
  months: z.coerce.number().int().min(1).max(24),
  note: z.string().trim().max(200).optional(),
});

/**
 * Books a subscription payment that arrived outside Mercado Pago — a transfer,
 * cash, a deal struck over the phone.
 *
 * Only the platform can record one: it is an assertion that we received money,
 * which a studio must never be able to make about itself. Nothing here renews,
 * so a studio on the manual path resurfaces the moment its period runs out.
 */
export async function recordManualChargeAction(formData: FormData) {
  const admin = await assertPlatformAdmin();
  const parsed = manualChargeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const amountCents = parsed.data.amount
    ? parseMoneyToCents(parsed.data.amount)
    : await planPriceCents(parsed.data.plan);
  if (amountCents === null) return;

  const ok = await recordManualCharge({
    studioId: parsed.data.studioId,
    plan: parsed.data.plan,
    amountCents,
    months: parsed.data.months,
    note: parsed.data.note || null,
    recordedById: admin.id,
  });
  if (!ok) return;

  await recordAudit({
    studioId: parsed.data.studioId,
    actorId: admin.id,
    actorLabel: `${admin.name} (plataforma)`,
    action: "platform.subscription_manual_charge",
    entityType: "Subscription",
    entityId: parsed.data.studioId,
    metadata: { amountCents, months: parsed.data.months, plan: parsed.data.plan },
  });

  await finishAdminAction(formData.get("returnTo"));
}

const priceSchema = z.object({
  ESSENTIAL: z.string().trim().min(1),
  STUDIO: z.string().trim().min(1),
  NETWORK: z.string().trim().min(1),
});

/**
 * Sets what the plans cost.
 *
 * Only quotes from here on: a studio already on auto-debit keeps paying the
 * amount it authorised, because Mercado Pago holds that figure and changing it
 * would need the owner to authorise again. New subscriptions and manual charges
 * pick the new price up immediately.
 */
export async function setPlanPricesAction(formData: FormData) {
  const admin = await assertPlatformAdmin();
  const parsed = priceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  for (const plan of PAID_PLANS) {
    const cents = parseMoneyToCents(parsed.data[plan]);
    if (cents === null || cents <= 0) continue;
    await setPlanPrice(plan, cents, admin.id);
  }

  /*
    Not written to AuditLog: every row there belongs to a studio, and a price
    change belongs to none of them. PlanPrice carries its own updatedAt and
    updatedById instead, which is the same record without bending the trail.
  */
  await finishAdminAction(formData.get("returnTo"));
}

/** Reverses a manual charge and gives back the time it bought. */
export async function voidChargeAction(formData: FormData) {
  const admin = await assertPlatformAdmin();
  const chargeId = String(formData.get("chargeId") ?? "");
  if (!chargeId) return;

  const charge = await db.subscriptionCharge.findUnique({ where: { id: chargeId } });
  if (!charge) return;

  const ok = await voidManualCharge(chargeId);
  if (!ok) return;

  await recordAudit({
    studioId: charge.studioId,
    actorId: admin.id,
    actorLabel: `${admin.name} (plataforma)`,
    action: "platform.subscription_charge_void",
    entityType: "SubscriptionCharge",
    entityId: chargeId,
    metadata: { amountCents: charge.amountCents, months: charge.months },
  });

  await finishAdminAction(formData.get("returnTo"));
}

const studioConfigSchema = z.object({
  studioId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().min(1).max(40),
  timezone: z.string().trim().min(1).max(60),
  currency: z.string().trim().length(3),
  locale: z.enum(["es", "en"]),
  cancellationCutoffHours: z.coerce.number().int().min(0).max(168),
  reminderHoursBefore: z.coerce.number().int().min(1).max(168),
  waitlistClaimWindowMins: z.coerce.number().int().min(5).max(1440),
  noShowLimit: z.coerce.number().int().min(0).max(50),
  monthlyChangesAllowed: z.coerce.number().int().min(0).max(31),
  bookingOpensDaysAhead: z.coerce.number().int().min(1).max(365),
});

/**
 * Edits a studio's configuration without logging in as them.
 *
 * The slug is the one field with reach beyond the studio: it is the public
 * booking URL, so it is normalised and checked for collisions, and an existing
 * link breaks when it changes. Everything else is the same set of dials the
 * studio has in its own settings.
 */
export async function updateStudioConfigAction(formData: FormData) {
  const admin = await assertPlatformAdmin();
  const parsed = studioConfigSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const { studioId, slug, currency, ...rest } = parsed.data;

  const studio = await db.studio.findUnique({ where: { id: studioId } });
  if (!studio) return;

  const nextSlug = slugify(slug);
  if (!nextSlug) return;

  if (nextSlug !== studio.slug) {
    const taken = await db.studio.findUnique({ where: { slug: nextSlug } });
    if (taken) return;
  }

  await db.studio.update({
    where: { id: studioId },
    data: { ...rest, slug: nextSlug, currency: currency.toUpperCase() },
  });

  await recordAudit({
    studioId,
    actorId: admin.id,
    actorLabel: `${admin.name} (plataforma)`,
    action: "platform.studio_config",
    entityType: "Studio",
    entityId: studioId,
    metadata: { slug: nextSlug, from: studio.slug },
  });

  await finishAdminAction(formData.get("returnTo"));
}
