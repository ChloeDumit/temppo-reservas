/**
 * What an hour on a space costs at a given moment.
 *
 * Pure, like the slot engine beside it: the loader fetches the bands, this
 * decides, and the same function prices the booking inside the transaction —
 * so what the page quoted and what the client is charged cannot disagree.
 */

export type Band = {
  weekdays: number[];
  startMin: number;
  endMin: number;
  priceCentsPerHour: number;
  label?: string | null;
};

export type PricedSpace = {
  priceCentsPerHour: number;
  bands: Band[];
};

/**
 * The band covering a local weekday and minute-of-day, or null for the base
 * rate. Later bands win, so a club can lay a holiday rate over a weekend one
 * by adding it afterwards rather than rewriting what it already had.
 */
export function bandAt(space: PricedSpace, weekday: number, minuteOfDay: number): Band | null {
  let found: Band | null = null;

  for (const band of space.bands) {
    if (!band.weekdays.includes(weekday)) continue;
    if (minuteOfDay < band.startMin || minuteOfDay >= band.endMin) continue;
    found = band;
  }

  return found;
}

/**
 * The price of one booking.
 *
 * Priced by the rate at the hour it starts, for the whole booking. A club
 * quotes "la hora pico sale 1.200" and charges that for the slot someone takes
 * at 19:30, rather than splitting the bill at 20:00 — doing it per minute
 * would be more defensible arithmetic and a worse answer to "¿cuánto sale?".
 */
export function rentalPriceCents(
  space: PricedSpace,
  weekday: number,
  startMinuteOfDay: number,
  durationMin: number,
): number {
  const band = bandAt(space, weekday, startMinuteOfDay);
  const perHour = band?.priceCentsPerHour ?? space.priceCentsPerHour;

  // Rounded to the cent, so 90 minutes of an odd hourly rate does not drift.
  return Math.round((perHour * durationMin) / 60);
}

/** The cheapest and dearest this space ever is, for "desde $X" on a listing. */
export function priceRange(space: PricedSpace): { minCents: number; maxCents: number } {
  const rates = [space.priceCentsPerHour, ...space.bands.map((b) => b.priceCentsPerHour)];
  return { minCents: Math.min(...rates), maxCents: Math.max(...rates) };
}
