import "server-only";
import { db } from "@/lib/db";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { dateKeyInZone } from "@/lib/dates";
import type { AppointmentSource, DepositStatus } from "@/generated/prisma/enums";
import { depositFor } from "./deposit";

export { depositFor };
import { availabilityQuery, liveAppointmentFilter, type AvailabilityStudio } from "./availability";
import { isSlotOpen, pickStaff } from "./slots";

export type AppointmentStudio = AvailabilityStudio & {
  cancellationCutoffHours: number;
  holdMinutes: number;
  noShowLimit: number;
  depositRefundable: boolean;
};

export type AppointmentErrorCode =
  | "NOT_FOUND"
  | "BLOCKED"
  | "IN_PAST"
  /** Inside the minimum notice, outside the shift, or simply not offered. */
  | "UNAVAILABLE"
  /** Someone else took it between showing and booking. */
  | "SLOT_TAKEN";

export type BookAppointmentResult =
  | {
      ok: true;
      appointmentId: string;
      /** The raw token for the client's manage link. Only ever returned here. */
      manageToken: string;
      depositCents: number;
      pending: boolean;
    }
  | { ok: false; code: AppointmentErrorCode };

const MINUTE = 60_000;

/**
 * Postgres refused the row because it overlaps another live appointment for
 * the same professional (the appointment_no_overlap exclusion constraint).
 * The driver adapter wraps the error differently across versions, so look for
 * the SQLSTATE or the constraint name anywhere in it.
 */
export function isOverlapError(error: unknown) {
  const seen = new Set<unknown>();
  const visit = (e: unknown): boolean => {
    if (!e || typeof e !== "object" || seen.has(e)) return false;
    seen.add(e);
    const o = e as Record<string, unknown>;
    if (o.code === "23P01" || o.originalCode === "23P01") return true;
    if (typeof o.message === "string" && o.message.includes("appointment_no_overlap")) return true;
    return visit(o.cause) || visit(o.meta) || visit(o.driverAdapterError);
  };
  return visit(error);
}

/** Holds that ran out but the sweep has not reached yet still occupy the constraint. */
async function releaseStaleHolds(client: Pick<typeof db, "appointment">, staffId: string, now: Date) {
  await client.appointment.updateMany({
    where: { staffId, status: "PENDING_PAYMENT", holdExpiresAt: { lte: now } },
    data: { status: "EXPIRED", depositStatus: "NONE" },
  });
}

/**
 * Books one service with one professional.
 *
 * A client booking online goes through every rule: the time must be one the
 * slot engine offers right now. Staff booking from the agenda may squeeze
 * someone in outside hours or inside the notice — it is their chair — but
 * never on top of another appointment; the database refuses that for anyone.
 *
 * With a deposit due, the appointment holds its slot as PENDING_PAYMENT until
 * holdExpiresAt and is confirmed when the money arrives.
 */
export async function bookAppointment(opts: {
  studio: AppointmentStudio;
  clientId: string;
  serviceId: string;
  addOnIds?: string[];
  /** null: any professional free at that time. */
  staffId: string | null;
  startsAt: Date;
  source: AppointmentSource;
  /** Ask for the service's deposit. Online bookings always do; staff choose. */
  collectDeposit: boolean;
  clientNotes?: string | null;
  now?: Date;
}): Promise<BookAppointmentResult> {
  const now = opts.now ?? new Date();
  const { studio } = opts;
  const online = opts.source === "CLIENT_PUBLIC";

  if (opts.startsAt <= now && online) return { ok: false, code: "IN_PAST" };

  const client = await db.studentProfile.findFirst({
    where: { id: opts.clientId, user: { studioId: studio.id } },
    select: { id: true, bookingBlocked: true },
  });
  if (!client) return { ok: false, code: "NOT_FOUND" };
  if (client.bookingBlocked && online) return { ok: false, code: "BLOCKED" };

  const manageToken = generateToken();

  try {
    return await db.$transaction(async (tx) => {
      const found = await availabilityQuery(
        studio,
        {
          serviceId: opts.serviceId,
          addOnIds: opts.addOnIds,
          staffId: opts.staffId,
          fromDate: dateKeyInZone(opts.startsAt, studio.timezone),
          days: 1,
          now,
        },
        tx,
      );
      if (!found) return { ok: false, code: "NOT_FOUND" } as const;
      const { query, offer } = found;

      // Who takes it: the one asked for, or the least busy of those free.
      let staffId = opts.staffId;
      if (online) {
        const free = query.staff.map((s) => s.id).filter((id) => isSlotOpen(query, id, opts.startsAt));
        if (!free.length) return { ok: false, code: "UNAVAILABLE" } as const;
        if (!staffId) {
          const load = await tx.appointment.groupBy({
            by: ["staffId"],
            where: {
              studioId: studio.id,
              staffId: { in: free },
              startsAt: { gte: new Date(opts.startsAt.getTime() - 12 * 60 * MINUTE) },
              endsAt: { lte: new Date(opts.startsAt.getTime() + 12 * 60 * MINUTE) },
              ...liveAppointmentFilter(now),
            },
            _count: true,
          });
          staffId = pickStaff(free, Object.fromEntries(load.map((l) => [l.staffId, l._count])));
        }
      } else if (!staffId) {
        staffId = offer.staff[0]?.id ?? null;
      }

      const pro = offer.staff.find((s) => s.id === staffId);
      if (!staffId || !pro) return { ok: false, code: "UNAVAILABLE" } as const;

      await releaseStaleHolds(tx, staffId, now);

      const endsAt = new Date(opts.startsAt.getTime() + pro.durationMin * MINUTE);
      const depositCents = opts.collectDeposit
        ? depositFor(offer.service.depositType, offer.service.depositValue, pro.priceCents)
        : 0;
      const pending = depositCents > 0;

      const appointment = await tx.appointment.create({
        data: {
          studioId: studio.id,
          staffId,
          clientId: client.id,
          serviceId: offer.service.id,
          serviceName: offer.service.name,
          startsAt: opts.startsAt,
          endsAt,
          blockedUntil: new Date(endsAt.getTime() + offer.service.bufferAfterMin * MINUTE),
          status: pending ? "PENDING_PAYMENT" : "CONFIRMED",
          source: opts.source,
          priceCents: pro.priceCents,
          depositCents,
          depositStatus: pending ? "PENDING" : "NONE",
          holdExpiresAt: pending ? new Date(now.getTime() + studio.holdMinutes * MINUTE) : null,
          manageTokenHash: hashToken(manageToken),
          clientNotes: opts.clientNotes || null,
          addOns: {
            create: offer.addOns.map((a) => ({
              addOnId: a.id,
              name: a.name,
              durationMin: a.durationMin,
              priceCents: a.priceCents,
            })),
          },
        },
      });

      return { ok: true, appointmentId: appointment.id, manageToken, depositCents, pending } as const;
    });
  } catch (error) {
    if (isOverlapError(error)) return { ok: false, code: "SLOT_TAKEN" };
    throw error;
  }
}

export type CancelAppointmentResult =
  | { ok: true; late: boolean; depositStatus: DepositStatus }
  | { ok: false; code: "NOT_FOUND" | "IN_PAST" | "ALREADY_CANCELLED" };

/**
 * Cancels, and decides what happens to a paid deposit.
 *
 * A client cancelling after the cutoff loses it — that is the point of a
 * seña. In time, it is refunded or kept as credit for the next visit, per the
 * studio's policy. When the studio cancels, the client never loses anything.
 */
export async function cancelAppointment(opts: {
  studio: AppointmentStudio;
  appointmentId: string;
  by: "client" | "staff";
  reason?: string | null;
  now?: Date;
}): Promise<CancelAppointmentResult> {
  const now = opts.now ?? new Date();
  const appt = await db.appointment.findFirst({
    where: { id: opts.appointmentId, studioId: opts.studio.id },
  });
  if (!appt) return { ok: false, code: "NOT_FOUND" };
  if (appt.status !== "CONFIRMED" && appt.status !== "PENDING_PAYMENT") {
    return { ok: false, code: "ALREADY_CANCELLED" };
  }
  if (appt.startsAt <= now && opts.by === "client") return { ok: false, code: "IN_PAST" };

  const cutoff = appt.startsAt.getTime() - opts.studio.cancellationCutoffHours * 60 * MINUTE;
  const late = opts.by === "client" && now.getTime() > cutoff;

  let depositStatus: DepositStatus = appt.depositStatus;
  if (appt.depositStatus === "PAID") {
    depositStatus = late ? "FORFEITED" : opts.studio.depositRefundable ? "REFUNDED" : "CREDIT";
  } else if (appt.depositStatus === "PENDING") {
    depositStatus = "NONE";
  }

  await db.appointment.update({
    where: { id: appt.id },
    data: {
      status: late ? "LATE_CANCELLED" : "CANCELLED",
      depositStatus,
      cancelledAt: now,
      cancelReason: opts.reason || null,
      holdExpiresAt: null,
    },
  });

  return { ok: true, late, depositStatus };
}

export type RescheduleResult =
  | { ok: true }
  | { ok: false; code: AppointmentErrorCode | "ALREADY_CANCELLED" | "TOO_LATE" };

/**
 * Moves an appointment to another time, and optionally another professional.
 * A client can only do it before the cancellation cutoff and only into a time
 * the booking page would offer; staff can drop it anywhere free.
 */
export async function rescheduleAppointment(opts: {
  studio: AppointmentStudio;
  appointmentId: string;
  startsAt: Date;
  staffId?: string;
  by: "client" | "staff";
  now?: Date;
}): Promise<RescheduleResult> {
  const now = opts.now ?? new Date();
  const appt = await db.appointment.findFirst({
    where: { id: opts.appointmentId, studioId: opts.studio.id },
    include: { addOns: true },
  });
  if (!appt) return { ok: false, code: "NOT_FOUND" };
  if (appt.status !== "CONFIRMED" && appt.status !== "PENDING_PAYMENT") {
    return { ok: false, code: "ALREADY_CANCELLED" };
  }

  const staffId = opts.staffId ?? appt.staffId;
  const client = opts.by === "client";

  if (client) {
    const cutoff = appt.startsAt.getTime() - opts.studio.cancellationCutoffHours * 60 * MINUTE;
    if (now.getTime() > cutoff) return { ok: false, code: "TOO_LATE" };
    if (!appt.serviceId) return { ok: false, code: "UNAVAILABLE" };

    const found = await availabilityQuery(opts.studio, {
      serviceId: appt.serviceId,
      addOnIds: appt.addOns.map((a) => a.addOnId).filter((id): id is string => Boolean(id)),
      staffId,
      fromDate: dateKeyInZone(opts.startsAt, opts.studio.timezone),
      days: 1,
      now,
      excludeAppointmentId: appt.id,
    });
    if (!found || !isSlotOpen(found.query, staffId, opts.startsAt)) return { ok: false, code: "UNAVAILABLE" };
  }

  // Same length, same cleanup: only the position on the calendar changes.
  const shift = opts.startsAt.getTime() - appt.startsAt.getTime();
  try {
    await releaseStaleHolds(db, staffId, now);
    await db.appointment.update({
      where: { id: appt.id },
      data: {
        staffId,
        startsAt: opts.startsAt,
        endsAt: new Date(appt.endsAt.getTime() + shift),
        blockedUntil: new Date(appt.blockedUntil.getTime() + shift),
        remindersSentAt: null,
      },
    });
  } catch (error) {
    if (isOverlapError(error)) return { ok: false, code: "SLOT_TAKEN" };
    throw error;
  }
  return { ok: true };
}

/**
 * Closes an appointment once it has happened. A no-show counts towards the
 * studio's limit exactly as a missed class does, and keeps the deposit.
 */
export async function markAppointment(opts: {
  studio: AppointmentStudio;
  appointmentId: string;
  outcome: "COMPLETED" | "NO_SHOW";
}) {
  const appt = await db.appointment.findFirst({
    where: { id: opts.appointmentId, studioId: opts.studio.id },
    include: { client: true },
  });
  if (!appt) return { ok: false as const, code: "NOT_FOUND" as const };

  const wasNoShow = appt.status === "NO_SHOW";
  const isNoShow = opts.outcome === "NO_SHOW";
  const delta = (isNoShow ? 1 : 0) - (wasNoShow ? 1 : 0);
  const count = Math.max(0, appt.client.noShowCount + delta);

  await db.$transaction([
    db.appointment.update({
      where: { id: appt.id },
      data: {
        status: opts.outcome,
        depositStatus: isNoShow && appt.depositStatus === "PAID" ? "FORFEITED" : appt.depositStatus,
      },
    }),
    db.studentProfile.update({
      where: { id: appt.clientId },
      data: {
        noShowCount: count,
        bookingBlocked:
          opts.studio.noShowLimit > 0 && count >= opts.studio.noShowLimit ? true : appt.client.bookingBlocked,
        ...(opts.outcome === "COMPLETED" ? { lastVisitAt: appt.startsAt } : {}),
      },
    }),
  ]);

  return { ok: true as const };
}

/** The appointment behind a client's manage link. */
export function findByManageToken(token: string) {
  return db.appointment.findUnique({
    where: { manageTokenHash: hashToken(token) },
    include: { studio: true, staff: { select: { id: true, name: true } }, client: { include: { user: true } }, addOns: true },
  });
}
