import { TZDate } from "@date-fns/tz";

/**
 * Converts a wall-clock date + time as written on the studio's wall into the
 * absolute instant we store. "2026-08-18" + "19:30" in America/Montevideo
 * becomes 2026-08-18T22:30:00Z.
 */
export function wallTimeToUtc(dateISO: string, timeHHmm: string, timeZone: string): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  const [hh, mm] = timeHHmm.split(":").map(Number);
  return new Date(new TZDate(y, m - 1, d, hh, mm, 0, timeZone).getTime());
}

/** Same instant, read as the studio sees it. */
export function inZone(date: Date, timeZone: string) {
  return new TZDate(date.getTime(), timeZone);
}

/** 0 = Sunday … 6 = Saturday, in the studio's zone. */
export function weekdayInZone(date: Date, timeZone: string) {
  return inZone(date, timeZone).getDay();
}

/** "YYYY-MM-DD" for the given instant in the studio's zone. */
export function dateKeyInZone(date: Date, timeZone: string) {
  const z = inZone(date, timeZone);
  return `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}`;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Monday-based start of week, at 00:00 studio time. */
export function startOfWeekInZone(date: Date, timeZone: string): Date {
  const z = inZone(date, timeZone);
  const offset = (z.getDay() + 6) % 7; // Monday = 0
  return wallTimeToUtc(
    `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate() - offset)}`,
    "00:00",
    timeZone,
  );
}

export function startOfDayInZone(date: Date, timeZone: string): Date {
  return wallTimeToUtc(dateKeyInZone(date, timeZone), "00:00", timeZone);
}

export function startOfMonthInZone(date: Date, timeZone: string): Date {
  const z = inZone(date, timeZone);
  return wallTimeToUtc(`${z.getFullYear()}-${pad(z.getMonth() + 1)}-01`, "00:00", timeZone);
}

export function formatTime(date: Date, timeZone: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(date);
}

export function formatDate(date: Date, timeZone: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(date);
}

export function formatDateTime(date: Date, timeZone: string, locale: string) {
  return `${formatDate(date, timeZone, locale)} · ${formatTime(date, timeZone, locale)}`;
}

export function formatWeekdayShort(date: Date, timeZone: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { weekday: "short", timeZone }).format(date);
}

/** Input value for <input type="date"> in the studio's zone. */
export function toDateInputValue(date: Date, timeZone: string) {
  return dateKeyInZone(date, timeZone);
}

export function ageFrom(birthDate: Date, now = new Date()) {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birthDate.getUTCDate())) age--;
  return age;
}

export function isBirthdayToday(birthDate: Date, timeZone: string, now = new Date()) {
  const today = inZone(now, timeZone);
  return (
    birthDate.getUTCMonth() === today.getMonth() && birthDate.getUTCDate() === today.getDate()
  );
}

/**
 * Same day-of-month, N months on, clamped to the end of a shorter month.
 *
 * Month boundaries pass in the first of a month, where the clamp never fires.
 * Billing periods don't: a subscription starting on the 31st has to land on
 * the 28th in February rather than skipping it for March 3rd.
 */
export function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  const day = next.getUTCDate();
  next.setUTCMonth(next.getUTCMonth() + months);
  // Overflowed into the following month — walk back to the intended one's last day.
  if (next.getUTCDate() < day) next.setUTCDate(0);
  return next;
}
