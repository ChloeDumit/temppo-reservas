import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { wallTimeToUtc } from "@/lib/dates";
import { shiftDateKey, type Interval, type SlotQuery } from "@/lib/appointments/slots";

type Client = Prisma.TransactionClient | typeof db;

export type VenueStudio = {
  id: string;
  timezone: string;
  bookingOpensDaysAhead: number;
  minNoticeMinutes: number;
  slotStepMinutes: number;
};

/** Rental states that occupy a space. */
export function liveRentalFilter(now: Date): Prisma.RentalWhereInput {
  return {
    OR: [{ status: "CONFIRMED" }, { status: "PENDING_PAYMENT", holdExpiresAt: { gt: now } }],
  };
}

/**
 * Feeds the appointments slot engine with spaces instead of professionals.
 *
 * The engine never asked what kind of thing it was filling: it wants an id,
 * how long the booking runs, when the thing is open and when it is busy. A
 * court answers all four. Reusing it rather than writing a second one means a
 * daylight-saving fix, or a bug in the step grid, is fixed once for both.
 *
 * Pass a transaction as `client` to re-check a time against the same rows the
 * insert will see.
 */
export async function venueAvailabilityQuery(
  studio: VenueStudio,
  opts: {
    /** Which spaces to consider. Omit for every active one. */
    spaceIds?: string[];
    /** Narrow to one kind — padel courts, say, and not the hall. */
    kind?: string | null;
    /** The length the client chose, in minutes. */
    durationMin: number;
    fromDate: string;
    days: number;
    now?: Date;
    /** Leave this rental out of busy time — it is the one being moved. */
    excludeRentalId?: string;
  },
  client: Client = db,
): Promise<{ query: SlotQuery; spaces: SpaceRow[] } | null> {
  const now = opts.now ?? new Date();

  const spaces = await client.space.findMany({
    where: {
      studioId: studio.id,
      isActive: true,
      ...(opts.kind ? { kind: opts.kind } : {}),
      ...(opts.spaceIds?.length ? { id: { in: opts.spaceIds } } : {}),
    },
    include: { hours: true, bands: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  // A space that does not offer this length is not a candidate for it.
  const candidates = spaces.filter((s) => s.durationsMin.includes(opts.durationMin));
  if (candidates.length === 0) return null;

  const ids = candidates.map((s) => s.id);

  // A day either side covers turnaround that spills over midnight.
  const windowStart = wallTimeToUtc(shiftDateKey(opts.fromDate, -1), "00:00", studio.timezone);
  const windowEnd = wallTimeToUtc(shiftDateKey(opts.fromDate, opts.days + 1), "00:00", studio.timezone);

  const [rentals, blocks] = await Promise.all([
    client.rental.findMany({
      where: {
        studioId: studio.id,
        spaceId: { in: ids },
        startsAt: { lt: windowEnd },
        blockedUntil: { gt: windowStart },
        ...(opts.excludeRentalId ? { id: { not: opts.excludeRentalId } } : {}),
        ...liveRentalFilter(now),
      },
      select: { spaceId: true, startsAt: true, blockedUntil: true },
    }),
    client.timeOff.findMany({
      where: {
        studioId: studio.id,
        // A whole-business closure has neither a person nor a space on it.
        OR: [{ AND: [{ staffId: null }, { spaceId: null }] }, { spaceId: { in: ids } }],
        startsAt: { lt: windowEnd },
        endsAt: { gt: windowStart },
      },
      select: { spaceId: true, startsAt: true, endsAt: true },
    }),
  ]);

  const busyFor = (id: string): Interval[] => [
    ...rentals.filter((r) => r.spaceId === id).map((r) => ({ start: r.startsAt, end: r.blockedUntil })),
    ...blocks
      .filter((b) => b.spaceId === null || b.spaceId === id)
      .map((b) => ({ start: b.startsAt, end: b.endsAt })),
  ];

  return {
    spaces: candidates,
    query: {
      timeZone: studio.timezone,
      fromDate: opts.fromDate,
      days: opts.days,
      now,
      minNoticeMin: studio.minNoticeMinutes,
      opensDaysAhead: studio.bookingOpensDaysAhead,
      stepMin: studio.slotStepMinutes,
      /*
        Turnaround is per space, but the engine takes one pair for the query.
        Zero here, and each space's own buffer is folded into the busy time it
        reports — which is where it belongs anyway, since a court being swept
        blocks that court and not the one beside it.
      */
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
      staff: candidates.map((space) => ({
        id: space.id,
        durationMin: opts.durationMin,
        hours: space.hours,
        busy: busyFor(space.id),
      })),
    },
  };
}

export type SpaceRow = Prisma.SpaceGetPayload<{ include: { hours: true; bands: true } }>;
