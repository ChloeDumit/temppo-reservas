"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertStaff } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { bookClass, cancelBooking, markAttendance } from "@/lib/booking";
import { offerNextSpot } from "@/lib/waitlist";
import { notifyPreferred } from "@/lib/notifications";
import { wallTimeToUtc } from "@/lib/dates";

export type ActionState = { error?: string; ok?: boolean } | null;

function revalidateSchedule() {
  revalidatePath("/[locale]/(app)/schedule", "page");
  revalidatePath("/[locale]/(app)/dashboard", "page");
}

/** Staff books a student onto a class from the roster screen. */
export async function addBookingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertStaff();
  const classInstanceId = String(formData.get("classInstanceId") ?? "");
  const studentId = String(formData.get("studentId") ?? "");
  if (!classInstanceId || !studentId) return { error: "generic" };

  const result = await bookClass({
    studio: user.studio,
    studentId,
    classInstanceId,
    source: "ADMIN",
    bypassWindow: true,
  });

  if (!result.ok) return { error: result.code };

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "booking.create",
    entityType: "Booking",
    entityId: result.bookingId,
    metadata: { classInstanceId, studentId, by: "staff" },
  });

  revalidateSchedule();
  return { ok: true };
}

export async function removeBookingAction(formData: FormData) {
  const user = await assertStaff();
  const bookingId = String(formData.get("bookingId") ?? "");

  const result = await cancelBooking({
    studio: user.studio,
    bookingId,
    forceRefund: true, // staff removing someone should never cost them a credit
  });

  if (result.ok) {
    await recordAudit({
      studioId: user.studioId,
      actorId: user.id,
      actorLabel: user.name,
      action: "booking.remove",
      entityType: "Booking",
      entityId: bookingId,
      metadata: { by: "staff" },
    });

    await offerNextSpot({ studio: user.studio, classInstanceId: result.classInstanceId });
  }

  revalidateSchedule();
}

export async function attendanceAction(formData: FormData) {
  const user = await assertStaff();
  const bookingId = String(formData.get("bookingId") ?? "");
  const attended = formData.get("attended") === "true";

  await markAttendance({ studio: user.studio, bookingId, attended });

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: attended ? "booking.attended" : "booking.no_show",
    entityType: "Booking",
    entityId: bookingId,
  });

  revalidateSchedule();
}

export async function cancelClassAction(formData: FormData) {
  const user = await assertStaff();
  const classInstanceId = String(formData.get("classInstanceId") ?? "");

  const instance = await db.classInstance.findFirst({
    where: { id: classInstanceId, studioId: user.studioId },
    include: {
      bookings: {
        where: { status: "BOOKED" },
        include: { student: { include: { user: true } } },
      },
    },
  });
  if (!instance) return;

  await db.classInstance.update({
    where: { id: instance.id },
    data: { status: "CANCELLED" },
  });

  // Everyone booked gets their credit back and a message.
  for (const booking of instance.bookings) {
    await cancelBooking({ studio: user.studio, bookingId: booking.id, forceRefund: true });
    await notifyPreferred({
      studioId: user.studioId,
      to: booking.student.user.email,
      phone: booking.student.user.phone,
      template: "class_cancelled",
      subject: `${user.studio.name} — clase cancelada`,
      body: `Hola ${booking.student.user.name}, la clase ${instance.name} fue cancelada. Tu crédito fue devuelto.`,
      relatedType: "ClassInstance",
      relatedId: instance.id,
    });
  }

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "class.cancel",
    entityType: "ClassInstance",
    entityId: instance.id,
    metadata: { name: instance.name, notified: instance.bookings.length },
  });

  revalidateSchedule();
}

const oneOffSchema = z.object({
  name: z.string().trim().min(1).max(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  durationMins: z.coerce.number().int().min(5).max(600),
  capacity: z.coerce.number().int().min(1).max(500),
  colorHex: z.string().default("#C0563C"),
  instructorId: z.string().optional(),
  locationId: z.string().optional(),
});

export async function createOneOffClassAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertStaff();
  const parsed = oneOffSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "generic" };

  const { name, date, time, durationMins, capacity, colorHex, instructorId, locationId } =
    parsed.data;
  const startsAt = wallTimeToUtc(date, time, user.studio.timezone);

  const instance = await db.classInstance.create({
    data: {
      studioId: user.studioId,
      name,
      colorHex,
      capacity,
      startsAt,
      endsAt: new Date(startsAt.getTime() + durationMins * 60_000),
      instructorId: instructorId || null,
      locationId: locationId || null,
    },
  });

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "class.create_one_off",
    entityType: "ClassInstance",
    entityId: instance.id,
    metadata: { name, startsAt: startsAt.toISOString() },
  });

  revalidateSchedule();
  return { ok: true };
}
