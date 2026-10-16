import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { wallTimeToUtc } from "@/lib/dates";
import { shiftDateKey, type Interval, type SlotQuery } from "./slots";

type Client = Prisma.TransactionClient | typeof db;

export type AvailabilityStudio = {
  id: string;
  timezone: string;
  bookingOpensDaysAhead: number;
  minNoticeMinutes: number;
  slotStepMinutes: number;
};

const STAFF_ROLES = ["OWNER", "ADMIN", "INSTRUCTOR"] as const;

/** Appointment states that occupy a professional's time. */
export function liveAppointmentFilter(now: Date): Prisma.AppointmentWhereInput {
  return {
    OR: [{ status: "CONFIRMED" }, { status: "PENDING_PAYMENT", holdExpiresAt: { gt: now } }],
  };
}

/**
 * Who can perform a service, and at what length and price.
 *
 * A service nobody has been assigned to is offered by every professional:
 * most businesses here are one woman, and making her tick herself on every
 * service before the booking page works would be a chore with no payoff.
 */
export async function serviceOffer(
  studioId: string,
  serviceId: string,
  addOnIds: string[] = [],
  client: Client = db,
) {
  const service = await client.service.findFirst({
    where: { id: serviceId, studioId, isActive: true },
    include: { staff: true },
  });
  if (!service) return null;

  const addOns = addOnIds.length
    ? await client.addOn.findMany({
        where: {
          id: { in: addOnIds },
          studioId,
          isActive: true,
          OR: [{ serviceId: null }, { serviceId }],
        },
      })
    : [];

  const staffUsers = await client.user.findMany({
    where: {
      studioId,
      isActive: true,
      role: { in: [...STAFF_ROLES] },
      ...(service.staff.length ? { id: { in: service.staff.map((s) => s.staffId) } } : {}),
    },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  const extraMin = addOns.reduce((sum, a) => sum + a.durationMin, 0);
  const extraCents = addOns.reduce((sum, a) => sum + a.priceCents, 0);

  const staff = staffUsers.map((u) => {
    const override = service.staff.find((s) => s.staffId === u.id);
    return {
      id: u.id,
      name: u.name,
      durationMin: (override?.durationMin ?? service.durationMin) + extraMin,
      priceCents: (override?.priceCents ?? service.priceCents) + extraCents,
    };
  });

  return { service, addOns, staff };
}

/**
 * Everything the slot engine needs for one service over a run of days. Pass
 * a transaction as `client` to re-check a time with the same rows the insert
 * will see.
 */
export async function availabilityQuery(
  studio: AvailabilityStudio,
  opts: {
    serviceId: string;
    addOnIds?: string[];
    /** Restrict to one professional; omit for "cualquiera". */
    staffId?: string | null;
    fromDate: string;
    days: number;
    now?: Date;
    /** Leave this appointment out of busy time — it is the one being moved. */
    excludeAppointmentId?: string;
  },
  client: Client = db,
): Promise<{ query: SlotQuery; offer: NonNullable<Awaited<ReturnType<typeof serviceOffer>>> } | null> {
  const now = opts.now ?? new Date();
  const offer = await serviceOffer(studio.id, opts.serviceId, opts.addOnIds, client);
  if (!offer) return null;

  const staff = opts.staffId ? offer.staff.filter((s) => s.id === opts.staffId) : offer.staff;
  const staffIds = staff.map((s) => s.id);

  // A day either side covers prep and cleanup that spill over midnight.
  const windowStart = wallTimeToUtc(shiftDateKey(opts.fromDate, -1), "00:00", studio.timezone);
  const windowEnd = wallTimeToUtc(shiftDateKey(opts.fromDate, opts.days + 1), "00:00", studio.timezone);

  const [hours, appointments, blocks] = await Promise.all([
    client.workingHours.findMany({ where: { studioId: studio.id, staffId: { in: staffIds } } }),
    client.appointment.findMany({
      where: {
        studioId: studio.id,
        staffId: { in: staffIds },
        startsAt: { lt: windowEnd },
        blockedUntil: { gt: windowStart },
        ...(opts.excludeAppointmentId ? { id: { not: opts.excludeAppointmentId } } : {}),
        ...liveAppointmentFilter(now),
      },
      select: { staffId: true, startsAt: true, blockedUntil: true },
    }),
    client.timeOff.findMany({
      where: {
        studioId: studio.id,
        OR: [{ staffId: null }, { staffId: { in: staffIds } }],
        startsAt: { lt: windowEnd },
        endsAt: { gt: windowStart },
      },
    }),
  ]);

  const busyFor = (id: string): Interval[] => [
    ...appointments.filter((a) => a.staffId === id).map((a) => ({ start: a.startsAt, end: a.blockedUntil })),
    ...blocks.filter((b) => b.staffId === null || b.staffId === id).map((b) => ({ start: b.startsAt, end: b.endsAt })),
  ];

  return {
    offer,
    query: {
      timeZone: studio.timezone,
      fromDate: opts.fromDate,
      days: opts.days,
      now,
      minNoticeMin: studio.minNoticeMinutes,
      opensDaysAhead: studio.bookingOpensDaysAhead,
      stepMin: studio.slotStepMinutes,
      bufferBeforeMin: offer.service.bufferBeforeMin,
      bufferAfterMin: offer.service.bufferAfterMin,
      staff: staff.map((s) => ({
        id: s.id,
        durationMin: s.durationMin,
        hours: hours.filter((h) => h.staffId === s.id),
        busy: busyFor(s.id),
      })),
    },
  };
}
