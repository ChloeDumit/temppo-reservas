"use server";

import { db } from "@/lib/db";
import { dateKeyInZone } from "@/lib/dates";
import { findSlots } from "@/lib/appointments/slots";
import { venueAvailabilityQuery } from "@/lib/venues/availability";
import { rentalPriceCents } from "@/lib/venues/pricing";
import { rentSpace } from "@/lib/venues/book";
import { findOrCreateClient } from "@/lib/appointments/clients";
import { weekdayInZone, minutesIntoDayInZone } from "@/lib/dates";

/** How many days of times the page asks for at once. */
const WINDOW_DAYS = 14;

async function openStudio(slug: string) {
  const studio = await db.studio.findUnique({ where: { slug } });
  if (!studio || studio.vertical !== "VENUES" || studio.suspendedAt) return null;
  return studio;
}

export type PublicSlot = {
  /** ISO instant. */
  start: string;
  /** Studio-local "HH:MM", so the page never formats a zone itself. */
  label: string;
  spaceIds: string[];
  priceCents: number;
};

export type PublicDay = { date: string; slots: PublicSlot[] };

/**
 * The times a client can take, for one length over the next fortnight.
 *
 * Priced here rather than on the page: the rate depends on the weekday and
 * the hour in the studio's zone, and the browser's zone is not the club's.
 */
export async function slotsAction(input: {
  slug: string;
  durationMin: number;
  spaceId?: string | null;
  kind?: string | null;
  fromDate?: string;
}): Promise<PublicDay[]> {
  const studio = await openStudio(input.slug);
  if (!studio) return [];

  const from = input.fromDate || dateKeyInZone(new Date(), studio.timezone);

  const found = await venueAvailabilityQuery(studio, {
    spaceIds: input.spaceId ? [input.spaceId] : undefined,
    kind: input.spaceId ? null : input.kind,
    durationMin: input.durationMin,
    fromDate: from,
    days: WINDOW_DAYS,
  });
  if (!found) return [];

  const priceOf = new Map(found.spaces.map((s) => [s.id, s]));

  return findSlots(found.query).map((day) => ({
    date: day.date,
    slots: day.slots.map((slot) => {
      const weekday = weekdayInZone(slot.start, studio.timezone);
      const minute = minutesIntoDayInZone(slot.start, studio.timezone);
      // The cheapest court free at this hour — the one "cualquiera" will
      // actually hand over, so the quote and the charge are the same number.
      const priceCents = Math.min(
        ...slot.staffIds.map((id) =>
          rentalPriceCents(priceOf.get(id)!, weekday, minute, input.durationMin),
        ),
      );
      return {
        start: slot.start.toISOString(),
        label: new Intl.DateTimeFormat("es-UY", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: studio.timezone,
        }).format(slot.start),
        spaceIds: slot.staffIds,
        priceCents,
      };
    }),
  }));
}

export type RentActionResult =
  | {
      ok: true;
      manageUrl: string;
      spaceName: string;
      priceCents: number;
      depositCents: number;
      /** The court is held, not confirmed, until the seña is paid. */
      pending: boolean;
    }
  | { ok: false; error: "unavailable" | "generic" };

/**
 * Takes the booking.
 *
 * Everything the form sent is re-checked server-side: the slug, that the club
 * is open to the public, and — inside the transaction — that the court is
 * still free. A page left open for twenty minutes must not be able to
 * double-book on submit.
 */
export async function rentAction(input: {
  slug: string;
  startsAt: string;
  durationMin: number;
  spaceId?: string | null;
  kind?: string | null;
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
}): Promise<RentActionResult> {
  const studio = await openStudio(input.slug);
  if (!studio) return { ok: false, error: "generic" };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "generic" };

  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) return { ok: false, error: "generic" };

  /*
      A phone is the identity here, as it is for an appointment: nobody makes
      an account to book a court, but the same number next month is the same
      person, and the club ends up with a customer list rather than a pile of
      names. A seña needs one too — a payment belongs to a client.
    */
  const phone = input.phone?.trim() || "";
  const client = phone
    ? await findOrCreateClient(studio.id, { name, phone, email: input.email })
    : null;

  const result = await rentSpace(studio, {
    spaceId: input.spaceId || null,
    kind: input.kind || null,
    clientId: client?.profile.id ?? null,
    collectDeposit: Boolean(client),
    startsAt,
    durationMin: input.durationMin,
    contactName: name,
    contactPhone: input.phone?.trim() || null,
    contactEmail: input.email?.trim() || null,
    notes: input.notes?.trim() || null,
    source: "ONLINE",
  });

  if (!result.ok) {
    return { ok: false, error: result.code === "UNAVAILABLE" ? "unavailable" : "generic" };
  }

  return {
    ok: true,
    spaceName: result.spaceName,
    priceCents: result.priceCents,
    depositCents: result.depositCents,
    pending: result.pending,
    // The one time the plaintext token is ever shown.
    manageUrl: `/m/${result.manageToken}`,
  };
}
