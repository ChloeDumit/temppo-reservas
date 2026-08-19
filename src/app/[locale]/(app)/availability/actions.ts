"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertStaff } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { syncRecurringBookings } from "@/lib/recurring";
import { offerNextSpot } from "@/lib/waitlist";

export type ActionState = { error?: string; ok?: boolean } | null;

function revalidateAll() {
  revalidatePath("/[locale]/(app)/availability", "page");
  revalidatePath("/[locale]/(app)/schedule", "page");
  revalidatePath("/[locale]/(app)/students/[id]", "page");
}

const assignSchema = z.object({
  classTemplateId: z.string().min(1),
  studentId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().optional(),
  note: z.string().trim().max(200).optional(),
});

/** Gives a student the same slot every week from `startDate` onward. */
export async function assignStandingSpotAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertStaff();
  const parsed = assignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "generic" };

  const { classTemplateId, studentId, startDate, endDate, note } = parsed.data;

  const template = await db.classTemplate.findFirst({
    where: { id: classTemplateId, studioId: user.studioId },
    include: {
      _count: { select: { recurringBookings: { where: { status: "ACTIVE" } } } },
    },
  });
  if (!template) return { error: "notFound" };

  const student = await db.studentProfile.findFirst({
    where: { id: studentId, user: { studioId: user.studioId } },
  });
  if (!student) return { error: "notFound" };

  const existing = await db.recurringBooking.findUnique({
    where: { classTemplateId_studentId: { classTemplateId, studentId } },
  });
  if (existing && existing.status !== "CANCELLED") return { error: "alreadyFixed" };

  // A standing spot permanently occupies a seat, so it can't oversubscribe.
  if (template._count.recurringBookings >= template.capacity) return { error: "slotFull" };

  const data = {
    status: "ACTIVE" as const,
    startDate: new Date(`${startDate}T00:00:00Z`),
    endDate: endDate ? new Date(`${endDate}T00:00:00Z`) : null,
    note: note || null,
  };

  const spot = existing
    ? await db.recurringBooking.update({ where: { id: existing.id }, data })
    : await db.recurringBooking.create({
        data: { ...data, studioId: user.studioId, classTemplateId, studentId },
      });

  // Claim the seat on every upcoming occurrence right away.
  await syncRecurringBookings(user.studio);

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "recurring_booking.assign",
    entityType: "RecurringBooking",
    entityId: spot.id,
    metadata: { classTemplateId, studentId, startDate },
  });

  revalidateAll();
  return { ok: true };
}

export async function releaseStandingSpotAction(formData: FormData) {
  const user = await assertStaff();
  const id = String(formData.get("id") ?? "");

  const spot = await db.recurringBooking.findFirst({
    where: { id, studioId: user.studioId },
  });
  if (!spot) return;

  await db.recurringBooking.update({ where: { id }, data: { status: "CANCELLED" } });

  // Free the seats this spot was holding on future classes.
  const future = await db.booking.findMany({
    where: {
      recurringBookingId: id,
      status: "BOOKED",
      classInstance: { startsAt: { gt: new Date() } },
    },
    select: { id: true, classInstanceId: true },
  });

  if (future.length > 0) {
    await db.booking.updateMany({
      where: { id: { in: future.map((b) => b.id) } },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    // Each freed seat can now go to whoever is waiting for it.
    for (const classInstanceId of new Set(future.map((b) => b.classInstanceId))) {
      await offerNextSpot({ studio: user.studio, classInstanceId });
    }
  }

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "recurring_booking.release",
    entityType: "RecurringBooking",
    entityId: id,
    metadata: { freedBookings: future.length },
  });

  revalidateAll();
}

/** Pauses without giving the slot up — holidays, injuries, a month away. */
export async function toggleStandingSpotAction(formData: FormData) {
  const user = await assertStaff();
  const id = String(formData.get("id") ?? "");

  const spot = await db.recurringBooking.findFirst({
    where: { id, studioId: user.studioId },
  });
  if (!spot || spot.status === "CANCELLED") return;

  const paused = spot.status === "ACTIVE";

  await db.recurringBooking.update({
    where: { id },
    data: { status: paused ? "PAUSED" : "ACTIVE" },
  });

  if (paused) {
    const future = await db.booking.findMany({
      where: {
        recurringBookingId: id,
        status: "BOOKED",
        classInstance: { startsAt: { gt: new Date() } },
      },
      select: { id: true, classInstanceId: true },
    });

    if (future.length > 0) {
      await db.booking.updateMany({
        where: { id: { in: future.map((b) => b.id) } },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      for (const classInstanceId of new Set(future.map((b) => b.classInstanceId))) {
        await offerNextSpot({ studio: user.studio, classInstanceId });
      }
    }
  } else {
    await syncRecurringBookings(user.studio);
  }

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: paused ? "recurring_booking.pause" : "recurring_booking.resume",
    entityType: "RecurringBooking",
    entityId: id,
  });

  revalidateAll();
}
