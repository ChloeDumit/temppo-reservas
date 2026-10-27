"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { ensureInstances } from "@/lib/classes";
import { assertAdmin } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { normalizeHex } from "@/lib/color";
import { parseMoneyToCents } from "@/lib/money";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { hashPassword } from "@/lib/auth/password";
import { generateTempPassword } from "@/lib/auth/temp-password";
import { notify } from "@/lib/notifications";
import { disconnectMercadoPago } from "@/lib/payments/mercadopago-oauth";
import { brandByKey } from "@/lib/brand/registry";
import { appUrlFor } from "@/lib/brand/url";

export type ActionState = {
  error?: string;
  ok?: boolean;
  /**
   * Shown to the inviter exactly once, so a new instructor can be signed in on
   * the spot. Never stored in plaintext and never logged.
   */
  tempPassword?: string;
} | null;

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
  monthlyChangesAllowed: z.coerce.number().int().min(0).max(31),
  bookingOpensDaysAhead: z.coerce.number().int().min(1).max(365),
});

export async function updateRulesAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertAdmin();
  const parsed = rulesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "generic" };

  const studio = await db.studio.update({
    where: { id: user.studioId },
    data: parsed.data,
  });

  /*
    Widening how far ahead booking opens needs the extra weeks generated now,
    not whenever the calendar next falls stale — the admin is about to look.
  */
  await ensureInstances(studio, new Date(), { force: true });

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

/**
 * Creates the account, hands back a one-time password and emails a magic link.
 *
 * The link alone was not enough. It only works if mail is configured and
 * actually lands — and when it doesn't, the account exists but nobody can get
 * into it, which looks from the outside like the invite did nothing at all.
 * Staff now get what students already got: a password to read out, and a forced
 * change on first sign-in so it never becomes a permanent one.
 */
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

  const tempPassword = generateTempPassword();

  const created = await db.user.create({
    data: {
      studioId: user.studioId,
      email: parsed.data.email,
      name: parsed.data.name,
      role: parsed.data.role,
      passwordHash: await hashPassword(tempPassword),
      mustChangePassword: true,
      ...(parsed.data.role === "INSTRUCTOR"
        ? { instructorProfile: { create: { payPerClassCents } } }
        : {}),
    },
  });

  /*
    A professional at an appointment business is bookable only with hours and
    the services she does. Starting her with the inviter's week and every
    service that names who does it means she shows up in the agenda and on
    the booking page from day one; both are adjusted afterwards in Horarios
    and Servicios.
  */
  if (user.studio.vertical === "APPOINTMENTS" && parsed.data.role === "INSTRUCTOR") {
    const week = await db.workingHours.findMany({ where: { studioId: user.studioId, staffId: user.id } });
    if (week.length) {
      await db.workingHours.createMany({
        data: week.map((h) => ({ studioId: user.studioId, staffId: created.id, weekday: h.weekday, startMin: h.startMin, endMin: h.endMin })),
      });
    }
    const assigned = await db.service.findMany({
      where: { studioId: user.studioId, isActive: true, staff: { some: {} } },
      select: { id: true },
    });
    if (assigned.length) {
      await db.serviceStaff.createMany({
        data: assigned.map((svc) => ({ serviceId: svc.id, staffId: created.id })),
        skipDuplicates: true,
      });
    }
  }

  const token = generateToken();
  await db.verificationToken.create({
    data: {
      userId: created.id,
      tokenHash: hashToken(token),
      purpose: "MAGIC_LINK",
      expiresAt: new Date(Date.now() + 7 * 86_400_000), // invites get a longer window
    },
  });

  // The link opens on the studio's own brand, where its staff sign in.
  const base = appUrlFor(user.studio);
  const product = brandByKey(user.studio.brand).name;
  await notify({
    studioId: user.studioId,
    to: created.email,
    template: "team_invite",
    subject: `${user.studio.name} — ${product}`,
    body: `Hola ${created.name},\n\n${user.name} te invitó a gestionar ${user.studio.name} en ${product}.\n\nEntrá acá: ${base}/api/auth/magic?token=${token}&locale=${user.studio.locale}`,
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
  // The plaintext exists only in this response — not in the database, not in a log.
  return { ok: true, tempPassword };
}

/** Unlinks the studio's Mercado Pago: online deposits go back to the platform's account. */
export async function disconnectMercadoPagoAction() {
  const user = await assertAdmin();
  await disconnectMercadoPago(user.studioId);
  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "studio.mercadopago_disconnected",
    entityType: "Studio",
    entityId: user.studioId,
  });
  revalidatePath("/[locale]/(app)/settings", "page");
}
