"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertAdmin, assertStaff, ADMIN_ROLES } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { wallTimeToUtc } from "@/lib/dates";
import { disconnectMercadoPago } from "@/lib/payments/mercadopago-oauth";

export type ActionState = { error?: string; ok?: boolean } | null;

const PAGE = "/[locale]/(app)/hours";

function toMinutes(value: FormDataEntryValue | null) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes <= 24 * 60 ? minutes : null;
}

/** Staff edit their own week; owners and admins anyone's. */
async function staffYouMayEdit(staffId: string) {
  const user = await assertStaff();
  if (staffId !== user.id && !ADMIN_ROLES.includes(user.role)) throw new Error("FORBIDDEN");
  const staff = await db.user.findFirst({
    where: { id: staffId, studioId: user.studioId, role: { in: ["OWNER", "ADMIN", "INSTRUCTOR"] } },
  });
  if (!staff) throw new Error("NOT_FOUND");
  return { user, staff };
}

/**
 * Replaces one professional's week. Each day takes up to two shifts —
 * morning and afternoon is how most salons run — written as HH:mm.
 */
export async function saveHoursAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, staff } = await staffYouMayEdit(String(formData.get("staffId") ?? ""));

  const rows: { weekday: number; startMin: number; endMin: number }[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    for (const n of [1, 2]) {
      const from = formData.get(`d${weekday}s${n}from`);
      const to = formData.get(`d${weekday}s${n}to`);
      if (!from && !to) continue;
      const startMin = toMinutes(from);
      const endMin = toMinutes(to);
      if (startMin === null || endMin === null || endMin <= startMin) return { error: "badShift" };
      rows.push({ weekday, startMin, endMin });
    }
  }

  // Two shifts on one day must not overlap each other.
  for (let weekday = 0; weekday < 7; weekday++) {
    const day = rows.filter((r) => r.weekday === weekday).sort((a, b) => a.startMin - b.startMin);
    if (day.length === 2 && day[1].startMin < day[0].endMin) return { error: "badShift" };
  }

  await db.$transaction([
    db.workingHours.deleteMany({ where: { staffId: staff.id } }),
    db.workingHours.createMany({ data: rows.map((r) => ({ ...r, studioId: user.studioId, staffId: staff.id })) }),
  ]);

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "hours.update",
    entityType: "User",
    entityId: staff.id,
    metadata: { shifts: rows.length },
  });

  revalidatePath(PAGE, "page");
  return { ok: true };
}

const timeOffSchema = z.object({
  staffId: z.string(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fromTime: z.string().regex(/^\d{2}:\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toTime: z.string().regex(/^\d{2}:\d{2}$/),
  reason: z.string().trim().max(120).optional(),
});

/** Blocks time off: a whole day, a long weekend, an hour for the dentist. */
export async function createTimeOffAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = timeOffSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "generic" };
  const v = parsed.data;

  // An empty staffId closes the whole business, which only an admin may do.
  let user;
  let staffId: string | null = null;
  if (v.staffId) {
    ({ user } = await staffYouMayEdit(v.staffId));
    staffId = v.staffId;
  } else {
    user = await assertAdmin();
  }

  const tz = user.studio.timezone;
  const startsAt = wallTimeToUtc(v.fromDate, v.fromTime, tz);
  const endsAt = wallTimeToUtc(v.toDate, v.toTime, tz);
  if (endsAt <= startsAt) return { error: "badRange" };

  await db.timeOff.create({
    data: { studioId: user.studioId, staffId, startsAt, endsAt, reason: v.reason || null },
  });

  revalidatePath(PAGE, "page");
  revalidatePath("/[locale]/(app)/agenda", "page");
  return { ok: true };
}

export async function deleteTimeOffAction(formData: FormData) {
  const user = await assertStaff();
  const block = await db.timeOff.findFirst({ where: { id: String(formData.get("id") ?? ""), studioId: user.studioId } });
  if (!block) return;
  if (block.staffId !== user.id && !ADMIN_ROLES.includes(user.role)) return;
  await db.timeOff.delete({ where: { id: block.id } });
  revalidatePath(PAGE, "page");
  revalidatePath("/[locale]/(app)/agenda", "page");
}

const rulesSchema = z.object({
  minNoticeMinutes: z.coerce.number().int().min(0).max(7 * 24 * 60),
  bookingOpensDaysAhead: z.coerce.number().int().min(1).max(365),
  slotStepMinutes: z.coerce.number().int().refine((n) => [5, 10, 15, 20, 30, 60].includes(n)),
  cancellationCutoffHours: z.coerce.number().int().min(0).max(14 * 24),
  holdMinutes: z.coerce.number().int().min(5).max(24 * 60),
});

export async function saveBookingRulesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertAdmin();
  const parsed = rulesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "generic" };

  await db.studio.update({
    where: { id: user.studioId },
    data: {
      ...parsed.data,
      depositRefundable: formData.get("depositRefundable") === "on",
      acceptMercadoPago: formData.get("acceptMercadoPago") === "on",
      acceptTransfer: formData.get("acceptTransfer") === "on",
    },
  });

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "studio.booking_rules",
    entityType: "Studio",
    entityId: user.studioId,
    metadata: parsed.data,
  });

  revalidatePath(PAGE, "page");
  return { ok: true };
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
  revalidatePath(PAGE, "page");
}
