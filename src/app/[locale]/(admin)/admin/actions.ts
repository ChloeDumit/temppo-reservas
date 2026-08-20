"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertPlatformAdmin } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import type { Plan } from "@/generated/prisma/enums";

/**
 * Platform-level actions.
 *
 * Every one of these reaches across tenants, so each re-checks the platform
 * flag rather than trusting the page that rendered the button, and each writes
 * an audit row against the studio it touched.
 */

function revalidateAdmin(studioId?: string) {
  revalidatePath("/[locale]/(admin)/admin", "page");
  revalidatePath("/[locale]/(admin)/admin/users", "page");
  if (studioId) revalidatePath("/[locale]/(admin)/admin/studios/[id]", "page");
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

  revalidateAdmin(studio.id);
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

  revalidateAdmin(studioId);
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

  revalidateAdmin(studioId);
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

  revalidateAdmin(user.studioId);
}
