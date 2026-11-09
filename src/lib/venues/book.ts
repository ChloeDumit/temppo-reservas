import "server-only";
import { db } from "@/lib/db";
import { dateKeyInZone, minutesIntoDayInZone, weekdayInZone } from "@/lib/dates";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { isSlotOpen, pickStaff } from "@/lib/appointments/slots";
import { venueAvailabilityQuery, liveRentalFilter, type VenueStudio } from "./availability";
import { rentalPriceCents } from "./pricing";

const MINUTE = 60_000;

export type VenueBookingStudio = VenueStudio & {
  holdMinutes: number;
};

export type RentOptions = {
  /** The space asked for. Omit online for "cualquier cancha libre". */
  spaceId?: string | null;
  /** What they asked for, when they did not ask for a particular one. */
  kind?: string | null;
  startsAt: Date;
  durationMin: number;
  /** Who it is for. A club takes walk-ins with no account at all. */
  clientId?: string | null;
  contactName: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
  source?: "STAFF" | "ONLINE";
  /** Staff may place a booking on a closed court; the public page may not. */
  allowBlocked?: boolean;
  now?: Date;
};

export type RentResult =
  | {
      ok: true;
      rentalId: string;
      spaceId: string;
      spaceName: string;
      priceCents: number;
      /** The plaintext half of the manage link. Shown once, never stored. */
      manageToken: string;
    }
  | { ok: false; code: "NOT_FOUND" | "UNAVAILABLE" | "BAD_DURATION" };

/**
 * Lets one space for one slot.
 *
 * The shape is the appointments booking's, deliberately: find what is free
 * inside the transaction, pick, insert. Checking availability outside the
 * transaction and trusting it inside is how two people end up on the same
 * court at eight on a Friday — the only moment it actually matters.
 */
export async function rentSpace(
  studio: VenueBookingStudio,
  opts: RentOptions,
): Promise<RentResult> {
  const now = opts.now ?? new Date();
  const online = (opts.source ?? "STAFF") === "ONLINE";
  const manageToken = generateToken();

  return db.$transaction(async (tx) => {
    const found = await venueAvailabilityQuery(
      studio,
      {
        spaceIds: opts.spaceId ? [opts.spaceId] : undefined,
        kind: opts.spaceId ? null : opts.kind,
        durationMin: opts.durationMin,
        fromDate: dateKeyInZone(opts.startsAt, studio.timezone),
        days: 1,
        now,
      },
      tx,
    );
    // No space offers this length — a 90-minute hall that only does half-days.
    if (!found) return { ok: false, code: "BAD_DURATION" } as const;

    const { query, spaces } = found;

    /*
      Staff booking a named court may place it anywhere the court is open,
      including over a block they have decided to override. The public page
      gets only what the engine says is free.
    */
    const free = spaces.map((s) => s.id).filter((id) => isSlotOpen(query, id, opts.startsAt));
    let spaceId = opts.spaceId ?? null;

    if (!spaceId) {
      if (!free.length) return { ok: false, code: "UNAVAILABLE" } as const;

      /*
        "Cualquiera" means the cheapest court free at that hour, not merely a
        free one. The booking page quotes a price beside every time, and with
        an indoor court in the mix the quote and the charge would otherwise
        depend on which court happened to be listed first — a club does not
        get to surprise someone by fifty pesos at the moment they confirm.

        Ties go to the least-booked court, which spreads the wear and leaves a
        run of adjacent courts free for a group that wants to play together.
      */
      const load = await tx.rental.groupBy({
        by: ["spaceId"],
        where: {
          studioId: studio.id,
          spaceId: { in: free },
          startsAt: { gte: new Date(opts.startsAt.getTime() - 12 * 60 * MINUTE) },
          endsAt: { lte: new Date(opts.startsAt.getTime() + 12 * 60 * MINUTE) },
          ...liveRentalFilter(now),
        },
        _count: true,
      });
      const byLoad = Object.fromEntries(load.map((l) => [l.spaceId, l._count]));

      const weekday = weekdayInZone(opts.startsAt, studio.timezone);
      const minute = minutesIntoDayInZone(opts.startsAt, studio.timezone);
      const quote = (id: string) => {
        const space = spaces.find((s) => s.id === id)!;
        return rentalPriceCents(space, weekday, minute, opts.durationMin);
      };

      const cheapest = Math.min(...free.map(quote));
      spaceId = pickStaff(free.filter((id) => quote(id) === cheapest), byLoad);
    } else if (online && !free.includes(spaceId)) {
      return { ok: false, code: "UNAVAILABLE" } as const;
    } else if (!online && !opts.allowBlocked && !free.includes(spaceId)) {
      return { ok: false, code: "UNAVAILABLE" } as const;
    }

    const space = spaces.find((s) => s.id === spaceId);
    if (!space) return { ok: false, code: "NOT_FOUND" } as const;

    const endsAt = new Date(opts.startsAt.getTime() + opts.durationMin * MINUTE);

    // Priced from the same rows the slot came from, in studio local time.
    const priceCents = rentalPriceCents(
      space,
      weekdayInZone(opts.startsAt, studio.timezone),
      minutesIntoDayInZone(opts.startsAt, studio.timezone),
      opts.durationMin,
    );

    const rental = await tx.rental.create({
      data: {
        studioId: studio.id,
        spaceId: space.id,
        spaceName: space.name,
        clientId: opts.clientId ?? null,
        contactName: opts.contactName,
        contactPhone: opts.contactPhone || null,
        contactEmail: opts.contactEmail || null,
        startsAt: opts.startsAt,
        endsAt,
        blockedUntil: new Date(endsAt.getTime() + space.bufferAfterMin * MINUTE),
        status: "CONFIRMED",
        source: opts.source ?? "STAFF",
        priceCents,
        manageTokenHash: hashToken(manageToken),
        notes: opts.notes || null,
      },
    });

    return {
      ok: true,
      rentalId: rental.id,
      spaceId: space.id,
      spaceName: space.name,
      priceCents,
      manageToken,
    } as const;
  });
}

/** Called off the manage link and from the agenda. */
export async function cancelRental(
  studioId: string,
  rentalId: string,
  reason?: string | null,
): Promise<boolean> {
  const rental = await db.rental.findFirst({
    where: { id: rentalId, studioId, status: { in: ["CONFIRMED", "PENDING_PAYMENT"] } },
  });
  if (!rental) return false;

  await db.rental.update({
    where: { id: rental.id },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason || null },
  });
  return true;
}
