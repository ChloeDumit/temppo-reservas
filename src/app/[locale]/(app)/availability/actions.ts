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

/** Weekday checkboxes arrive as repeated form fields. */
function parseWeekdays(formData: FormData) {
  return [...new Set(formData.getAll("weekdays").map((v) => Number(v)))]
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b);
}

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
      recurringBookings: { where: { status: "ACTIVE" }, select: { id: true, weekdays: true } },
    },
  });
  if (!template) return { error: "notFound" };

  // Default to the whole template when nothing is ticked, which is what a
  // studio means by "every week" for a single-day class.
  const requested = parseWeekdays(formData);
  const weekdays = (requested.length > 0 ? requested : template.weekdays).filter((d) =>
    template.weekdays.includes(d),
  );
  if (weekdays.length === 0) return { error: "noWeekdays" };

  const student = await db.studentProfile.findFirst({
    where: { id: studentId, user: { studioId: user.studioId } },
  });
  if (!student) return { error: "notFound" };

  const existing = await db.recurringBooking.findUnique({
    where: { classTemplateId_studentId: { classTemplateId, studentId } },
  });
  if (existing && existing.status !== "CANCELLED") return { error: "alreadyFixed" };

  /*
    Capacity is per weekday, not per template: Monday can be full while Friday
    still has room, and counting across the whole template would refuse a spot
    on a day that is empty.
  */
  const full = weekdays.filter(
    (day) =>
      template.recurringBookings.filter(
        (booking) => booking.id !== existing?.id && booking.weekdays.includes(day),
      ).length >= template.capacity,
  );
  if (full.length > 0) return { error: "slotFull" };

  const data = {
    weekdays,
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
    metadata: { classTemplateId, studentId, startDate, weekdays },
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
