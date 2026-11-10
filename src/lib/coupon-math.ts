/*
  The arithmetic of a discount code, without the database, so the booking
  page can show the price it will charge before she books.
*/

/** "  verano20 " → "VERANO20". */
export function normalizeCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

/** What a percentage takes off, rounded to whole pesos so prices stay clean. */
export function discountFor(priceCents: number, percentOff: number) {
  const raw = (priceCents * percentOff) / 100;
  return Math.min(priceCents, Math.round(raw / 100) * 100);
}
