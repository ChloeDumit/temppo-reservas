"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { normalizeHex } from "@/lib/color";
import { parseMoneyToCents } from "@/lib/money";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { notify } from "@/lib/notifications";

export type ActionState = { error?: string; ok?: boolean } | null;

function revalidateSettings() {
  revalidatePath("/[locale]/(app)/settings", "page");
  revalidatePath("/[locale]/(app)", "layout");
}

const studioSchema = z.object({
  name: z.string().trim().min(2).max(80),
  timezone: z.string().trim().min(1).max(60),
  currency: z.string().trim().length(3),
  locale: z.enum(["es", "en"]),
  accentColor: z.string().trim(),
  logoUrl: z.string().trim().max(500).optional(),
  whatsappNumber: z.string().trim().max(25).optional(),
});

export async function updateStudioAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertAdmin();
  const parsed = studioSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "generic" };

  const logoUrl = parsed.data.logoUrl?.trim();
  if (logoUrl && !/^https?:\/\//i.test(logoUrl)) return { error: "generic" };

  await db.studio.update({
    where: { id: user.studioId },
    data: {
      name: parsed.data.name,
      timezone: parsed.data.timezone,
      currency: parsed.data.currency.toUpperCase(),
      locale: parsed.data.locale,
      accentColor: normalizeHex(parsed.data.accentColor),
      logoUrl: logoUrl || null,
      // Stored as typed; wa.me links strip everything but digits.
      whatsappNumber: parsed.data.whatsappNumber?.trim() || null,
    },
  });

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "studio.update",
    entityType: "Studio",
    entityId: user.studioId,
    metadata: { name: parsed.data.name },
  });

  revalidateSettings();
  return { ok: true };
}

const rulesSchema = z.object({
  cancellationCutoffHours: z.coerce.number().int().min(0).max(168),
  reminderHoursBefore: z.coerce.number().int().min(1).max(168),
  waitlistClaimWindowMins: z.coerce.number().int().min(5).max(1440),
  noShowLimit: z.coerce.number().int().min(0).max(50),
  bookingOpensDaysAhead: z.coerce.number().int().min(1).max(365),
});

export async function updateRulesAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertAdmin();
  const parsed = rulesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "generic" };

  await db.studio.update({ where: { id: user.studioId }, data: parsed.data });

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "studio.update_rules",
    entityType: "Studio",
    entityId: user.studioId,
    metadata: parsed.data,
  });

  revalidateSettings();
  return { ok: true };
}

const locationSchema = z.object({
  name: z.string().trim().min(1).max(80),
  address: z.string().trim().max(200).optional(),
});

export async function createLocationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertAdmin();
  const parsed = locationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "generic" };

  const created = await db.location.create({
    data: {
      studioId: user.studioId,
      name: parsed.data.name,
      address: parsed.data.address || null,
    },
  });

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "location.create",
    entityType: "Location",
    entityId: created.id,
    metadata: { name: parsed.data.name },
  });

  revalidateSettings();
  return { ok: true };
}

const memberSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["ADMIN", "INSTRUCTOR"]),
  payPerClass: z.string().optional(),
});

/** Creates the account and emails a magic link — no password to share. */
export async function inviteMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertAdmin();
  const parsed = memberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.path[0] === "email" ? "invalidEmail" : "generic" };
  }

  // Scoped to the studio: the same person may already be staff somewhere else.
  if (await db.user.findFirst({ where: { studioId: user.studioId, email: parsed.data.email } })) {
    return { error: "emailTaken" };
  }

  const payPerClassCents = parsed.data.payPerClass
    ? parseMoneyToCents(parsed.data.payPerClass)
    : null;

  const created = await db.user.create({
    data: {
      studioId: user.studioId,
      email: parsed.data.email,
      name: parsed.data.name,
      role: parsed.data.role,
      ...(parsed.data.role === "INSTRUCTOR"
        ? { instructorProfile: { create: { payPerClassCents } } }
        : {}),
    },
  });

  const token = generateToken();
  await db.verificationToken.create({
    data: {
      userId: created.id,
      tokenHash: hashToken(token),
      purpose: "MAGIC_LINK",
      expiresAt: new Date(Date.now() + 7 * 86_400_000), // invites get a longer window
    },
  });

  const base = process.env.APP_URL || "http://localhost:3000";
  await notify({
    studioId: user.studioId,
    to: created.email,
    template: "team_invite",
    subject: `${user.studio.name} — TEMPPO Reservas`,
    body: `Hola ${created.name},\n\n${user.name} te invitó a gestionar ${user.studio.name} en TEMPPO Reservas.\n\nEntrá acá: ${base}/api/auth/magic?token=${token}&locale=${user.studio.locale}`,
    relatedType: "User",
    relatedId: created.id,
  });

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "team.invite",
    entityType: "User",
    entityId: created.id,
    metadata: { email: parsed.data.email, role: parsed.data.role },
  });

  revalidateSettings();
  return { ok: true };
}
