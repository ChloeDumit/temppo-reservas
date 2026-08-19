import "server-only";
import { db } from "@/lib/db";
import type { BookingSource } from "@/generated/prisma/enums";

export type BookingErrorCode =
  | "NOT_FOUND"
  | "BLOCKED"
  | "IN_PAST"
  | "TOO_EARLY"
  | "CLASS_FULL"
  | "CLASS_CANCELLED"
  | "ALREADY_BOOKED"
  | "NO_CREDITS";

export type BookingResult =
  | { ok: true; bookingId: string; usedPackId: string | null }
  | { ok: false; code: BookingErrorCode };

type StudioRules = {
  id: string;
  cancellationCutoffHours: number;
  bookingOpensDaysAhead: number;
  noShowLimit: number;
};

/** Packs that can still pay for a class right now, soonest to expire first. */
export async function activePacksFor(studentId: string, now = new Date()) {
  return db.studentPack.findMany({
    where: {
      studentId,
      status: "ACTIVE",
      expiresAt: { gt: now },
      startsAt: { lte: now },
    },
    include: { pack: true },
    orderBy: { expiresAt: "asc" },
  });
}

/** Remaining classes across all active packs. `null` means an unlimited pack. */
export async function creditsRemaining(studentId: string, now = new Date()) {
  const packs = await activePacksFor(studentId, now);
  if (packs.some((p) => p.isUnlimited)) return null;
  return packs.reduce((sum, p) => sum + Math.max(0, p.creditsTotal - p.creditsUsed), 0);
}

/**
 * Books a spot. Runs serializable so two students racing for the last place
 * can't both win — the loser's transaction fails and retries below.
 */
export async function bookClass(params: {
  studio: StudioRules;
  studentId: string;
  classInstanceId: string;
  source?: BookingSource;
  /** Staff booking on someone's behalf bypasses the "opens in N days" window. */
  bypassWindow?: boolean;
  now?: Date;
}): Promise<BookingResult> {
  const { studio, studentId, classInstanceId, bypassWindow = false } = params;
  const source = params.source ?? "STUDENT";
  const now = params.now ?? new Date();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(
        async (tx) => {
          const instance = await tx.classInstance.findFirst({
            where: { id: classInstanceId, studioId: studio.id },
          });
          if (!instance) return { ok: false, code: "NOT_FOUND" } as const;
          if (instance.status === "CANCELLED") {
            return { ok: false, code: "CLASS_CANCELLED" } as const;
          }
          if (instance.startsAt.getTime() <= now.getTime()) {
            return { ok: false, code: "IN_PAST" } as const;
          }

          if (!bypassWindow) {
            const opensAt =
              instance.startsAt.getTime() - studio.bookingOpensDaysAhead * 86_400_000;
            if (now.getTime() < opensAt) return { ok: false, code: "TOO_EARLY" } as const;
          }

          const student = await tx.studentProfile.findUnique({ where: { id: studentId } });
          if (!student) return { ok: false, code: "NOT_FOUND" } as const;
          if (student.bookingBlocked && source === "STUDENT") {
            return { ok: false, code: "BLOCKED" } as const;
          }

          const existing = await tx.booking.findUnique({
            where: { classInstanceId_studentId: { classInstanceId, studentId } },
          });
          if (existing) {
            if (existing.status === "BOOKED") {
              return { ok: false, code: "ALREADY_BOOKED" } as const;
            }
            // Re-booking after a cancellation reuses the row.
          }

          const taken = await tx.booking.count({
            where: { classInstanceId, status: { in: ["BOOKED", "ATTENDED"] } },
          });
          if (taken >= instance.capacity) return { ok: false, code: "CLASS_FULL" } as const;

          // Spend a credit. Unlimited packs are attached but never decremented.
          const packs = await tx.studentPack.findMany({
            where: {
              studentId,
              status: "ACTIVE",
              expiresAt: { gt: now },
              startsAt: { lte: now },
            },
            orderBy: { expiresAt: "asc" },
          });

          const unlimited = packs.find((p) => p.isUnlimited);
          const withCredit = packs.find((p) => !p.isUnlimited && p.creditsUsed < p.creditsTotal);
          const chosen = unlimited ?? withCredit;

          if (!chosen && source === "STUDENT") {
            return { ok: false, code: "NO_CREDITS" } as const;
          }

          if (chosen && !chosen.isUnlimited) {
            const used = chosen.creditsUsed + 1;
            await tx.studentPack.update({
              where: { id: chosen.id },
              data: {
                creditsUsed: used,
                status: used >= chosen.creditsTotal ? "EXHAUSTED" : "ACTIVE",
              },
            });
          }

          const booking = existing
            ? await tx.booking.update({
                where: { id: existing.id },
                data: {
                  status: "BOOKED",
                  source,
                  studentPackId: chosen?.id ?? null,
                  cancelledAt: null,
                },
              })
            : await tx.booking.create({
                data: {
                  studioId: studio.id,
                  classInstanceId,
                  studentId,
                  source,
                  studentPackId: chosen?.id ?? null,
                },
              });

          // Booking a spot supersedes any waitlist entry for the same class.
          await tx.waitlistEntry.updateMany({
            where: { classInstanceId, studentId, status: { in: ["WAITING", "OFFERED"] } },
            data: { status: "CLAIMED" },
          });

          return { ok: true, bookingId: booking.id, usedPackId: chosen?.id ?? null } as const;
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      const isSerializationFailure =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2034";
      if (isSerializationFailure && attempt < 2) continue;
      throw error;
    }
  }

  return { ok: false, code: "CLASS_FULL" };
}

export type CancelResult =
  | { ok: true; late: boolean; refunded: boolean; classInstanceId: string }
  | { ok: false; code: "NOT_FOUND" | "IN_PAST" | "ALREADY_CANCELLED" };

/**
 * Cancels a booking. Inside the studio's cutoff the credit comes back; past it
 * the class is spent, which is what the cutoff is for.
 */
export async function cancelBooking(params: {
  studio: StudioRules;
  bookingId: string;
  /** Staff cancellations always refund. */
  forceRefund?: boolean;
  now?: Date;
}): Promise<CancelResult> {
  const { studio, bookingId, forceRefund = false } = params;
  const now = params.now ?? new Date();

  return db.$transaction(async (tx) => {
    const booking = await tx.booking.findFirst({
      where: { id: bookingId, studioId: studio.id },
      include: { classInstance: true },
    });
    if (!booking) return { ok: false, code: "NOT_FOUND" } as const;
    if (booking.status === "CANCELLED" || booking.status === "LATE_CANCELLED") {
      return { ok: false, code: "ALREADY_CANCELLED" } as const;
    }
    if (booking.classInstance.startsAt.getTime() <= now.getTime() && !forceRefund) {
      return { ok: false, code: "IN_PAST" } as const;
    }

    const cutoffAt =
      booking.classInstance.startsAt.getTime() - studio.cancellationCutoffHours * 3_600_000;
    const late = !forceRefund && now.getTime() > cutoffAt;
    const refunded = !late && booking.studentPackId !== null;

    if (refunded && booking.studentPackId) {
      const pack = await tx.studentPack.findUnique({ where: { id: booking.studentPackId } });
      if (pack && !pack.isUnlimited) {
        await tx.studentPack.update({
          where: { id: pack.id },
          data: {
            creditsUsed: Math.max(0, pack.creditsUsed - 1),
            // Returning a credit revives an exhausted pack that hasn't expired.
            status: pack.status === "EXHAUSTED" && pack.expiresAt > now ? "ACTIVE" : pack.status,
          },
        });
      }
    }

    await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: late ? "LATE_CANCELLED" : "CANCELLED",
        cancelledAt: now,
        studentPackId: refunded ? null : booking.studentPackId,
      },
    });

    return {
      ok: true,
      late,
      refunded,
      classInstanceId: booking.classInstanceId,
    } as const;
  });
}

/** Marks attendance and keeps the student's no-show counter in step. */
export async function markAttendance(params: {
  studio: StudioRules;
  bookingId: string;
  attended: boolean;
  now?: Date;
}) {
  const { studio, bookingId, attended } = params;
  const now = params.now ?? new Date();

  return db.$transaction(async (tx) => {
    const booking = await tx.booking.findFirst({
      where: { id: bookingId, studioId: studio.id },
      include: { student: true },
    });
    if (!booking) return null;

    const wasNoShow = booking.status === "NO_SHOW";
    const becomesNoShow = !attended;

    await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: attended ? "ATTENDED" : "NO_SHOW",
        checkedInAt: attended ? (booking.checkedInAt ?? now) : null,
      },
    });

    if (wasNoShow !== becomesNoShow) {
      const delta = becomesNoShow ? 1 : -1;
      const count = Math.max(0, booking.student.noShowCount + delta);
      await tx.studentProfile.update({
        where: { id: booking.studentId },
        data: {
          noShowCount: count,
          // Auto-block only trips going up; unblocking stays a deliberate act.
          bookingBlocked:
            studio.noShowLimit > 0 && count >= studio.noShowLimit
              ? true
              : booking.student.bookingBlocked,
        },
      });
    }

    return booking;
  });
}
