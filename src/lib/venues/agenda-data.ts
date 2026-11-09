import "server-only";
import { db } from "@/lib/db";
import { wallTimeToUtc } from "@/lib/dates";
import { liveRentalFilter } from "./availability";

export type AgendaRental = {
  id: string;
  spaceId: string;
  contactName: string;
  contactPhone: string | null;
  startsAt: Date;
  endsAt: Date;
  priceCents: number;
  status: string;
  source: string;
  notes: string | null;
};

export type AgendaSpace = {
  id: string;
  name: string;
  kind: string | null;
  colorHex: string | null;
  durationsMin: number[];
  /** Open and close for this weekday, in minutes since local midnight. */
  openMin: number | null;
  closeMin: number | null;
};

export type AgendaBlock = {
  id: string;
  spaceId: string | null;
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
};

export type DayAgenda = {
  date: string;
  spaces: AgendaSpace[];
  rentals: AgendaRental[];
  blocks: AgendaBlock[];
  /** The hours the grid has to draw: the earliest open to the latest close. */
  fromMin: number;
  toMin: number;
  takenCents: number;
};

/**
 * One day across every court.
 *
 * A club reads its day as a grid — courts across, hours down — so everything
 * here is gathered per day rather than per court, and the opening hours come
 * back folded to this weekday so the page can draw the frame without
 * recalculating a shift per cell.
 */
export async function dayAgenda(
  studio: { id: string; timezone: string },
  dateKey: string,
): Promise<DayAgenda> {
  const dayStart = wallTimeToUtc(dateKey, "00:00", studio.timezone);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);

  // The weekday of this date, read off the key rather than the clock.
  const [y, m, d] = dateKey.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

  const [spaces, rentals, blocks] = await Promise.all([
    db.space.findMany({
      where: { studioId: studio.id, isActive: true },
      include: { hours: { where: { weekday } } },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    }),
    db.rental.findMany({
      where: {
        studioId: studio.id,
        startsAt: { lt: dayEnd },
        endsAt: { gt: dayStart },
        status: { in: ["CONFIRMED", "PENDING_PAYMENT", "NO_SHOW"] },
      },
      orderBy: { startsAt: "asc" },
    }),
    db.timeOff.findMany({
      where: {
        studioId: studio.id,
        startsAt: { lt: dayEnd },
        endsAt: { gt: dayStart },
      },
      select: { id: true, spaceId: true, startsAt: true, endsAt: true, reason: true },
    }),
  ]);

  const agendaSpaces: AgendaSpace[] = spaces.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    colorHex: s.colorHex,
    durationsMin: s.durationsMin,
    // Several shifts on one day become one span: a court that shuts for lunch
    // still draws one column, with the closure showing as a gap.
    openMin: s.hours.length ? Math.min(...s.hours.map((h) => h.startMin)) : null,
    closeMin: s.hours.length ? Math.max(...s.hours.map((h) => h.endMin)) : null,
  }));

  const open = agendaSpaces.map((s) => s.openMin).filter((v): v is number => v !== null);
  const close = agendaSpaces.map((s) => s.closeMin).filter((v): v is number => v !== null);

  return {
    date: dateKey,
    spaces: agendaSpaces,
    rentals: rentals.map((r) => ({
      id: r.id,
      spaceId: r.spaceId,
      contactName: r.contactName,
      contactPhone: r.contactPhone,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      priceCents: r.priceCents,
      status: r.status,
      source: r.source,
      notes: r.notes,
    })),
    blocks,
    // A club with nothing open today still gets a readable, empty frame.
    fromMin: open.length ? Math.min(...open) : 8 * 60,
    toMin: close.length ? Math.max(...close) : 23 * 60,
    // What the day is worth, counting only what is actually held.
    takenCents: rentals
      .filter((r) => r.status === "CONFIRMED" || r.status === "NO_SHOW")
      .reduce((sum, r) => sum + r.priceCents, 0),
  };
}

/** Today's takings and tomorrow's load, for the home panel. */
export async function venueSummary(studio: { id: string; timezone: string }, now: Date) {
  const soon = new Date(now.getTime() + 24 * 60 * 60_000);
  const [upcoming, todayCount] = await Promise.all([
    db.rental.findMany({
      where: { studioId: studio.id, startsAt: { gte: now, lt: soon }, ...liveRentalFilter(now) },
      include: { space: { select: { name: true } } },
      orderBy: { startsAt: "asc" },
      take: 6,
    }),
    db.rental.count({
      where: { studioId: studio.id, startsAt: { gte: now, lt: soon }, ...liveRentalFilter(now) },
    }),
  ]);
  return { upcoming, todayCount };
}
