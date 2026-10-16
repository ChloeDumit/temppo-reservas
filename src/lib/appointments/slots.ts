import { addDays, dateKeyInZone, wallTimeToUtc } from "@/lib/dates";

/**
 * Which start times a client can book.
 *
 * Pure on purpose: no database, no clock of its own, no `server-only`. The
 * loader in availability.ts gathers the facts, this decides, and the same
 * function re-checks the chosen time inside the booking transaction — so
 * what the page offered and what the server accepts can never disagree.
 *
 * The rules, per professional and per day:
 * - the service itself, [start, end), sits inside one of her shifts;
 * - the service plus its prep and cleanup, [start − before, end + after),
 *   touches nothing she is already busy with (appointments, blocks, closures);
 * - starts fall on the studio's step (every 15 minutes, say) in local time;
 * - nothing sooner than the minimum notice, nothing beyond the booking window.
 *
 * Times are built from the wall clock one at a time, so a daylight-saving
 * change moves the shift with the clock instead of shifting every slot.
 */

export type Shift = { weekday: number; startMin: number; endMin: number };
export type Interval = { start: Date; end: Date };

export type StaffAvailability = {
  id: string;
  /** Service plus add-ons, at this professional's pace. */
  durationMin: number;
  hours: Shift[];
  /** Appointments (up to blockedUntil), her blocks and whole-studio closures. */
  busy: Interval[];
};

export type SlotQuery = {
  timeZone: string;
  /** First studio-local day to look at, "YYYY-MM-DD". */
  fromDate: string;
  days: number;
  now: Date;
  minNoticeMin: number;
  opensDaysAhead: number;
  stepMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  staff: StaffAvailability[];
};

export type Slot = {
  start: Date;
  /** Every professional free at this time, in the order they were given. */
  staffIds: string[];
};

export type DaySlots = { date: string; slots: Slot[] };

const MINUTE = 60_000;

/** "YYYY-MM-DD" plus n days, as calendar arithmetic with no zone involved. */
export function shiftDateKey(dateKey: string, n: number) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

function weekdayOfKey(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function hhmm(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function overlaps(a: Interval, b: Interval) {
  return a.start < b.end && b.start < a.end;
}

/** The start times one professional can take on one day. */
function startsFor(
  q: SlotQuery,
  staff: StaffAvailability,
  dateKey: string,
  earliest: Date,
): Date[] {
  const weekday = weekdayOfKey(dateKey);
  const result: Date[] = [];

  for (const shift of staff.hours) {
    if (shift.weekday !== weekday) continue;

    const shiftEnd = wallTimeToUtc(dateKey, hhmm(shift.endMin), q.timeZone);
    // First start on the step grid at or after the shift opens.
    const first = Math.ceil(shift.startMin / q.stepMin) * q.stepMin;

    for (let m = first; m + staff.durationMin <= shift.endMin; m += q.stepMin) {
      const start = wallTimeToUtc(dateKey, hhmm(m), q.timeZone);
      if (start < earliest) continue;

      const end = new Date(start.getTime() + staff.durationMin * MINUTE);
      if (end > shiftEnd) break;

      const blocked: Interval = {
        start: new Date(start.getTime() - q.bufferBeforeMin * MINUTE),
        end: new Date(end.getTime() + q.bufferAfterMin * MINUTE),
      };
      if (staff.busy.some((b) => overlaps(blocked, b))) continue;

      result.push(start);
    }
  }

  return result;
}

export function findSlots(q: SlotQuery): DaySlots[] {
  const earliest = new Date(q.now.getTime() + q.minNoticeMin * MINUTE);
  const lastDate = dateKeyInZone(addDays(q.now, q.opensDaysAhead), q.timeZone);
  const days: DaySlots[] = [];

  for (let i = 0; i < q.days; i++) {
    const date = shiftDateKey(q.fromDate, i);
    if (date > lastDate) break;

    const byStart = new Map<number, string[]>();
    for (const staff of q.staff) {
      for (const start of startsFor(q, staff, date, earliest)) {
        const key = start.getTime();
        const ids = byStart.get(key) ?? [];
        if (!ids.includes(staff.id)) ids.push(staff.id);
        byStart.set(key, ids);
      }
    }

    const slots = [...byStart.entries()]
      .sort(([a], [b]) => a - b)
      .map(([t, staffIds]) => ({ start: new Date(t), staffIds }));
    days.push({ date, slots });
  }

  return days;
}

/** Whether this professional can take exactly this start time. */
export function isSlotOpen(q: Omit<SlotQuery, "fromDate" | "days">, staffId: string, start: Date) {
  const date = dateKeyInZone(start, q.timeZone);
  const [day] = findSlots({ ...q, fromDate: date, days: 1 });
  return Boolean(
    day?.slots.some((s) => s.start.getTime() === start.getTime() && s.staffIds.includes(staffId)),
  );
}

/**
 * "Cualquiera": the free professional with the fewest bookings that day, so
 * work spreads across the team. Ties go to the order the studio lists them.
 */
export function pickStaff(staffIds: string[], load: Record<string, number>) {
  return staffIds.reduce((best, id) => ((load[id] ?? 0) < (load[best] ?? 0) ? id : best), staffIds[0]);
}
