/**
 * Fixed start times as a professional types them in Ajustes — "8:15, 10:00,
 * 13" — and back. Stored as minutes from midnight.
 */

const MAX_TIMES = 48;

/** Minutes from midnight, sorted and without repeats; null if any is not a time. Empty text: []. */
export function parseStartTimes(text: string): number[] | null {
  const parts = text.split(/[\s,;/]+/).filter(Boolean);
  const minutes = new Set<number>();
  for (const part of parts) {
    const m = /^(\d{1,2})(?:[:.h](\d{2}))?(?:hs?)?$/i.exec(part);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2] ?? 0);
    if (h > 23 || min > 59) return null;
    minutes.add(h * 60 + min);
  }
  if (minutes.size > MAX_TIMES) return null;
  return [...minutes].sort((a, b) => a - b);
}

/** "8:15, 10:00, 13:00" */
export function formatStartTimes(minutes: number[]) {
  return minutes.map((m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`).join(", ");
}
