"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertUser } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { bookClass, cancelBooking } from "@/lib/booking";
import { joinWaitlist, leaveWaitlist, offerNextSpot } from "@/lib/waitlist";

export type BookState = { error?: string; ok?: boolean } | null;

function revalidateStudent() {
  revalidatePath("/[locale]/(app)/book", "page");
  revalidatePath("/[locale]/(app)/my", "page");
}

/** The student's own booking action — studio rules apply in full. */
export async function bookAction(_prev: BookState, formData: FormData): Promise<BookState> {
  const user = await assertUser();
  if (!user.studentProfile) return { error: "FORBIDDEN" };

  const classInstanceId = String(formData.get("classInstanceId") ?? "");
  const result = await bookClass({
    studio: user.studio,
    studentId: user.studentProfile.id,
    classInstanceId,
    source: "STUDENT",
  });

  if (!result.ok) return { error: result.code };

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "booking.create",
    entityType: "Booking",
    entityId: result.bookingId,
    metadata: { classInstanceId, by: "student" },
  });

  revalidateStudent();
  return { ok: true };
}

export async function cancelOwnBookingAction(
  _prev: BookState,
  formData: FormData,
): Promise<BookState> {
  const user = await assertUser();
  if (!user.studentProfile) return { error: "FORBIDDEN" };

  const bookingId = String(formData.get("bookingId") ?? "");

  // Confirm the booking is actually theirs before touching it.
  const booking = await db.booking.findFirst({
    where: { id: bookingId, studentId: user.studentProfile.id, studioId: user.studioId },
  });
  if (!booking) return { error: "NOT_FOUND" };

  const result = await cancelBooking({ studio: user.studio, bookingId });
  if (!result.ok) return { error: result.code };

  // The freed seat goes straight to whoever is first in line.
  await offerNextSpot({ studio: user.studio, classInstanceId: result.classInstanceId });

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: result.late ? "booking.late_cancel" : "booking.cancel",
    entityType: "Booking",
    entityId: bookingId,
    metadata: { late: result.late, refunded: result.refunded, by: "student" },
  });

  revalidateStudent();
  return { ok: true };
}

export async function joinWaitlistAction(
  _prev: BookState,
  formData: FormData,
): Promise<BookState> {
  const user = await assertUser();
  if (!user.studentProfile) return { error: "FORBIDDEN" };

  const classInstanceId = String(formData.get("classInstanceId") ?? "");
  const instance = await db.classInstance.findFirst({
    where: { id: classInstanceId, studioId: user.studioId, status: "SCHEDULED" },
  });
  if (!instance) return { error: "NOT_FOUND" };
  if (instance.startsAt.getTime() <= Date.now()) return { error: "IN_PAST" };

  const { entry } = await joinWaitlist({
    studioId: user.studioId,
    classInstanceId,
    studentId: user.studentProfile.id,
  });

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "waitlist.join",
    entityType: "WaitlistEntry",
    entityId: entry.id,
    metadata: { classInstanceId },
  });

  // If a seat is somehow already free, offer it immediately.
  await offerNextSpot({ studio: user.studio, classInstanceId });

  revalidateStudent();
  return { ok: true };
}

export async function leaveWaitlistAction(
  _prev: BookState,
  formData: FormData,
): Promise<BookState> {
  const user = await assertUser();
  if (!user.studentProfile) return { error: "FORBIDDEN" };

  const classInstanceId = String(formData.get("classInstanceId") ?? "");
  await leaveWaitlist({ classInstanceId, studentId: user.studentProfile.id });

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "waitlist.leave",
    entityType: "WaitlistEntry",
    entityId: null,
    metadata: { classInstanceId },
  });

  revalidateStudent();
  return { ok: true };
}
