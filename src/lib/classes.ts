import "server-only";
import { db } from "@/lib/db";
import { addDays, dateKeyInZone, wallTimeToUtc, weekdayInZone } from "@/lib/dates";
import { syncRecurringBookings } from "@/lib/recurring";

type StudioLike = {
  id: string;
  timezone: string;
  bookingOpensDaysAhead: number;
};

/**
 * Materialises recurring templates into concrete, bookable occurrences.
 *
 * Called lazily whenever the schedule is read and after a template changes, so
 * Phase 1 needs no cron. Instances are never deleted by this function — a
 * cancelled class keeps its row (status CANCELLED) and the unique constraint on
 * (templateId, startsAt) stops it from reappearing.
 */
export async function ensureInstances(studio: StudioLike, now = new Date()) {
  const templates = await db.classTemplate.findMany({
    where: { studioId: studio.id, isActive: true },
  });
  if (templates.length === 0) {
    // Still reconcile standing spots against instances that already exist.
    await syncRecurringBookings(studio, now);
    return 0;
  }

  // A little past the booking window so staff can see what's coming.
  const horizonDays = Math.max(studio.bookingOpensDaysAhead, 14) + 7;
  const todayKey = dateKeyInZone(now, studio.timezone);

  const candidates: {
    studioId: string;
    templateId: string;
    locationId: string | null;
    instructorId: string | null;
    name: string;
    colorHex: string;
    startsAt: Date;
    endsAt: Date;
    capacity: number;
  }[] = [];

  for (const template of templates) {
    if (template.weekdays.length === 0) continue;

    const templateStartKey = dateKeyInZone(template.startDate, "UTC");
    const templateEndKey = template.endDate ? dateKeyInZone(template.endDate, "UTC") : null;

    for (let offset = 0; offset <= horizonDays; offset++) {
      const day = addDays(now, offset);
      const dayKey = dateKeyInZone(day, studio.timezone);

      if (dayKey < templateStartKey) continue;
      if (templateEndKey && dayKey > templateEndKey) break;
      if (dayKey < todayKey) continue;

      const startsAt = wallTimeToUtc(dayKey, template.startTime, studio.timezone);

      // Match on the weekday of the resolved instant, not of the calendar day —
      // a DST shift can move the wall time across a day boundary.
      if (!template.weekdays.includes(weekdayInZone(startsAt, studio.timezone))) continue;

      // Don't backfill occurrences that already started today.
      if (startsAt.getTime() < now.getTime()) continue;

      candidates.push({
        studioId: studio.id,
        templateId: template.id,
        locationId: template.locationId,
        instructorId: template.instructorId,
        name: template.name,
        colorHex: template.colorHex,
        startsAt,
        endsAt: new Date(startsAt.getTime() + template.durationMins * 60_000),
        capacity: template.capacity,
      });
    }
  }

  if (candidates.length === 0) return 0;

  const result = await db.classInstance.createMany({
    data: candidates,
    skipDuplicates: true, // unique(templateId, startsAt)
  });

  // Standing weekly spots claim their seats on any newly created occurrence.
  await syncRecurringBookings(studio, now);

  return result.count;
}
