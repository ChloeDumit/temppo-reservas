"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { parseMoneyToCents } from "@/lib/money";
import { normalizeHex } from "@/lib/color";
import { requireVenueAdmin } from "@/lib/venues/guards";
import { minutesFromHhmm } from "@/lib/venues/guards";

export type ActionState = { error?: string; ok?: boolean } | null;

function revalidate() {
  revalidatePath("/[locale]/(app)/spaces", "page");
  revalidatePath("/[locale]/(app)/rentals", "page");
}

const spaceSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(80),
  kind: z.string().trim().max(40).optional(),
  capacity: z.string().optional(),
  pricePerHour: z.string().trim().min(1),
  /** "60,90" — the lengths this space is let for. */
  durations: z.string().trim().min(1),
  bufferAfterMin: z.coerce.number().int().min(0).max(240).default(0),
  colorHex: z.string().optional(),
  /** "08:00" and "23:00", applied to every weekday that is ticked. */
  openFrom: z.string().regex(/^\d{1,2}:\d{2}$/),
  openTo: z.string().regex(/^\d{1,2}:\d{2}$/),
});

function parseDurations(raw: string): number[] | null {
  const parts = raw
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((p) => Number(p));

  if (parts.some((n) => !Number.isInteger(n) || n < 15 || n > 12 * 60)) return null;
  const unique = [...new Set(parts)].sort((a, b) => a - b);
  return unique.length ? unique : null;
}

/**
 * Creates or updates a space, with its opening hours.
 *
 * Hours are replaced wholesale rather than diffed: a court has at most seven
 * rows, and rewriting them is both simpler to reason about and impossible to
 * leave half-applied.
 */
export async function saveSpaceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireVenueAdmin();
  const parsed = spaceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "generic" };

  const data = parsed.data;
  const durations = parseDurations(data.durations);
  if (!durations) return { error: "badDurations" };

  const priceCents = parseMoneyToCents(data.pricePerHour);
  if (priceCents === null || priceCents <= 0) return { error: "badPrice" };

  const startMin = minutesFromHhmm(data.openFrom);
  const endMin = minutesFromHhmm(data.openTo);
  if (startMin === null || endMin === null || endMin <= startMin) return { error: "badHours" };

  const weekdays = formData
    .getAll("weekday")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  if (weekdays.length === 0) return { error: "noDays" };

  const capacity = data.capacity?.trim() ? Number(data.capacity) : null;
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) {
    return { error: "generic" };
  }

  const fields = {
    name: data.name,
    kind: data.kind?.trim() || null,
    capacity,
    priceCentsPerHour: priceCents,
    durationsMin: durations,
    bufferAfterMin: data.bufferAfterMin,
    colorHex: data.colorHex ? normalizeHex(data.colorHex) : null,
  };

  const hours = weekdays.map((weekday) => ({ weekday, startMin, endMin }));

  if (data.id) {
    // Scoped to the studio: an id from elsewhere must not be editable.
    const existing = await db.space.findFirst({
      where: { id: data.id, studioId: user.studioId },
      select: { id: true },
    });
    if (!existing) return { error: "generic" };

    await db.$transaction([
      db.space.update({ where: { id: existing.id }, data: fields }),
      db.spaceHours.deleteMany({ where: { spaceId: existing.id } }),
      db.spaceHours.createMany({ data: hours.map((h) => ({ ...h, spaceId: existing.id })) }),
    ]);
  } else {
    const count = await db.space.count({ where: { studioId: user.studioId } });
    await db.space.create({
      data: {
        studioId: user.studioId,
        position: count,
        ...fields,
        hours: { create: hours },
      },
    });
  }

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: data.id ? "space.update" : "space.create",
    entityType: "Space",
    entityId: data.id ?? fields.name,
    metadata: { name: fields.name, durations },
  });

  revalidate();
  return { ok: true };
}

/**
 * Takes a space out of use without deleting it.
 *
 * Deleting would take its bookings with it, including the ones already played
 * and paid for, so a court that is gone is deactivated and keeps its history.
 */
export async function toggleSpaceAction(formData: FormData): Promise<void> {
  const user = await requireVenueAdmin();
  const id = String(formData.get("id") ?? "");

  const space = await db.space.findFirst({
    where: { id, studioId: user.studioId },
    select: { id: true, isActive: true, name: true },
  });
  if (!space) return;

  await db.space.update({ where: { id: space.id }, data: { isActive: !space.isActive } });
  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: space.isActive ? "space.deactivate" : "space.activate",
    entityType: "Space",
    entityId: space.id,
    metadata: { name: space.name },
  });
  revalidate();
}

const bandSchema = z.object({
  spaceId: z.string().min(1),
  label: z.string().trim().max(40).optional(),
  from: z.string().regex(/^\d{1,2}:\d{2}$/),
  to: z.string().regex(/^\d{1,2}:\d{2}$/),
  pricePerHour: z.string().trim().min(1),
});

/** A peak rate: Friday evening is not Tuesday morning. */
export async function saveBandAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireVenueAdmin();
  const parsed = bandSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "generic" };

  const { spaceId, label, from, to, pricePerHour } = parsed.data;

  const space = await db.space.findFirst({
    where: { id: spaceId, studioId: user.studioId },
    select: { id: true },
  });
  if (!space) return { error: "generic" };

  const startMin = minutesFromHhmm(from);
  const endMin = minutesFromHhmm(to);
  if (startMin === null || endMin === null || endMin <= startMin) return { error: "badHours" };

  const priceCents = parseMoneyToCents(pricePerHour);
  if (priceCents === null || priceCents <= 0) return { error: "badPrice" };

  const weekdays = formData
    .getAll("bandWeekday")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  if (weekdays.length === 0) return { error: "noDays" };

  await db.spacePriceBand.create({
    data: { spaceId: space.id, label: label || null, weekdays, startMin, endMin, priceCentsPerHour: priceCents },
  });

  revalidate();
  return { ok: true };
}

export async function removeBandAction(formData: FormData): Promise<void> {
  const user = await requireVenueAdmin();
  const id = String(formData.get("id") ?? "");
  // Reached through the space, so another studio's band is out of range.
  await db.spacePriceBand.deleteMany({
    where: { id, space: { studioId: user.studioId } },
  });
  revalidate();
}
