"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { wallTimeToUtc } from "@/lib/dates";
import { recordAudit } from "@/lib/audit";
import { requireVenueStaff } from "@/lib/venues/guards";
import { rentSpace, cancelRental } from "@/lib/venues/book";

export type ActionState = { error?: string; ok?: boolean } | null;

function revalidate() {
  revalidatePath("/[locale]/(app)/rentals", "page");
}

const newRental = z.object({
  spaceId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{1,2}:\d{2}$/),
  durationMin: z.coerce.number().int().min(15).max(24 * 60),
  contactName: z.string().trim().min(1).max(120),
  contactPhone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(400).optional(),
  /** The counter may put a booking on a closed court; the public page may not. */
  force: z.string().optional(),
});

/**
 * A booking taken at the counter.
 *
 * Goes through the same `rentSpace` the public page uses, so the overlap check
 * and the pricing are the one implementation — a court booked by phone and one
 * booked online cannot end up on top of each other.
 */
export async function createRentalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireVenueStaff();
  const parsed = newRental.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "generic" };

  const { date, time, force, ...rest } = parsed.data;
  const startsAt = wallTimeToUtc(date, time, user.studio.timezone);

  const result = await rentSpace(user.studio, {
    spaceId: rest.spaceId,
    startsAt,
    durationMin: rest.durationMin,
    contactName: rest.contactName,
    contactPhone: rest.contactPhone || null,
    notes: rest.notes || null,
    source: "STAFF",
    allowBlocked: force === "on",
  });

  if (!result.ok) {
    return { error: result.code === "BAD_DURATION" ? "badDuration" : "unavailable" };
  }

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "rental.create",
    entityType: "Rental",
    entityId: result.rentalId,
    metadata: { space: result.spaceName, startsAt: startsAt.toISOString() },
  });

  revalidate();
  return { ok: true };
}

export async function cancelRentalAction(formData: FormData): Promise<void> {
  const user = await requireVenueStaff();
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;

  if (await cancelRental(user.studioId, id, reason)) {
    await recordAudit({
      studioId: user.studioId,
      actorId: user.id,
      actorLabel: user.name,
      action: "rental.cancel",
      entityType: "Rental",
      entityId: id,
      metadata: { reason },
    });
  }
  revalidate();
}

/** Nobody turned up. Kept apart from a cancellation so it can be counted. */
export async function markNoShowAction(formData: FormData): Promise<void> {
  const user = await requireVenueStaff();
  const id = String(formData.get("id") ?? "");

  const rental = await db.rental.findFirst({
    where: { id, studioId: user.studioId, status: "CONFIRMED" },
  });
  if (rental) {
    await db.rental.update({ where: { id: rental.id }, data: { status: "NO_SHOW" } });
    await recordAudit({
      studioId: user.studioId,
      actorId: user.id,
      actorLabel: user.name,
      action: "rental.no_show",
      entityType: "Rental",
      entityId: id,
    });
  }
  revalidate();
}

const blockSchema = z.object({
  spaceId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  from: z.string().regex(/^\d{1,2}:\d{2}$/),
  to: z.string().regex(/^\d{1,2}:\d{2}$/),
  reason: z.string().trim().max(120).optional(),
});

/** Maintenance, a tournament, rain. Closes a court without deleting anything. */
export async function blockSpaceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireVenueStaff();
  const parsed = blockSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "generic" };

  const { spaceId, date, from, to, reason } = parsed.data;
  const startsAt = wallTimeToUtc(date, from, user.studio.timezone);
  const endsAt = wallTimeToUtc(date, to, user.studio.timezone);
  if (endsAt <= startsAt) return { error: "generic" };

  // A space id from another studio would close a court that is not theirs.
  if (spaceId) {
    const owned = await db.space.findFirst({
      where: { id: spaceId, studioId: user.studioId },
      select: { id: true },
    });
    if (!owned) return { error: "generic" };
  }

  await db.timeOff.create({
    data: {
      studioId: user.studioId,
      spaceId: spaceId || null,
      startsAt,
      endsAt,
      reason: reason || null,
    },
  });

  revalidate();
  return { ok: true };
}

export async function removeBlockAction(formData: FormData): Promise<void> {
  const user = await requireVenueStaff();
  const id = String(formData.get("id") ?? "");
  await db.timeOff.deleteMany({ where: { id, studioId: user.studioId } });
  revalidate();
}
