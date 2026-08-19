import "server-only";
import { db } from "@/lib/db";
import { dateKeyInZone } from "@/lib/dates";

type StudioLike = {
  id: string;
  timezone: string;
};

/**
 * Turns standing weekly spots into real bookings on every future occurrence.
 *
 * Runs alongside class generation, so a fixed spot claims its seat before
 * casual booking can take it — which is the whole point of holding one.
 * Existing bookings are left alone; the unique constraint on
 * (classInstanceId, studentId) makes re-running this safe.
 */
export async function syncRecurringBookings(studio: StudioLike, now = new Date()) {
  const standing = await db.recurringBooking.findMany({
    where: { studioId: studio.id, status: "ACTIVE" },
    include: { classTemplate: { select: { id: true, capacity: true } } },
  });
  if (standing.length === 0) return 0;

  const templateIds = [...new Set(standing.map((s) => s.classTemplateId))];

  const instances = await db.classInstance.findMany({
    where: {
      studioId: studio.id,
      status: "SCHEDULED",
      templateId: { in: templateIds },
      startsAt: { gt: now },
    },
    select: { id: true, templateId: true, startsAt: true, capacity: true },
    orderBy: { startsAt: "asc" },
  });
  if (instances.length === 0) return 0;

  // Seats already spoken for, so a fixed spot can't push a class over capacity.
  const taken = await db.booking.groupBy({
    by: ["classInstanceId"],
    where: {
      classInstanceId: { in: instances.map((i) => i.id) },
      status: { in: ["BOOKED", "ATTENDED"] },
    },
    _count: { _all: true },
  });
  const takenBy = new Map(taken.map((row) => [row.classInstanceId, row._count._all]));

  const existing = await db.booking.findMany({
    where: {
      classInstanceId: { in: instances.map((i) => i.id) },
      studentId: { in: standing.map((s) => s.studentId) },
    },
    select: { classInstanceId: true, studentId: true },
  });
  const alreadyBooked = new Set(existing.map((b) => `${b.classInstanceId}:${b.studentId}`));

  const byTemplate = new Map<string, typeof standing>();
  for (const spot of standing) {
    const list = byTemplate.get(spot.classTemplateId) ?? [];
    list.push(spot);
    byTemplate.set(spot.classTemplateId, list);
  }

  const toCreate: {
    studioId: string;
    classInstanceId: string;
    studentId: string;
    source: "RECURRING";
    recurringBookingId: string;
  }[] = [];

  for (const instance of instances) {
    if (!instance.templateId) continue;
    const spots = byTemplate.get(instance.templateId);
    if (!spots) continue;

    const dayKey = dateKeyInZone(instance.startsAt, studio.timezone);
    let seats = takenBy.get(instance.id) ?? 0;

    for (const spot of spots) {
      // Respect the window the standing spot is valid for.
      if (dayKey < dateKeyInZone(spot.startDate, "UTC")) continue;
      if (spot.endDate && dayKey > dateKeyInZone(spot.endDate, "UTC")) continue;

      const key = `${instance.id}:${spot.studentId}`;
      if (alreadyBooked.has(key)) continue;
      if (seats >= instance.capacity) break;

      toCreate.push({
        studioId: studio.id,
        classInstanceId: instance.id,
        studentId: spot.studentId,
        source: "RECURRING",
        recurringBookingId: spot.id,
      });
      alreadyBooked.add(key);
      seats++;
    }
  }

  if (toCreate.length === 0) return 0;

  const result = await db.booking.createMany({ data: toCreate, skipDuplicates: true });
  return result.count;
}

export type SlotAvailability = {
  templateId: string;
  name: string;
  colorHex: string;
  weekday: number;
  startTime: string;
  durationMins: number;
  capacity: number;
  instructorName: string | null;
  locationName: string | null;
  /** Students holding this slot every week. */
  fixed: { id: string; studentId: string; studentName: string; status: string }[];
  /** Seats left once the standing spots are accounted for. */
  freeSpots: number;
};

/**
 * The answer to "is Monday at 17:00 free every week?" — one row per weekly
 * slot, with the standing spots that occupy it. This is what replaces the
 * spreadsheet the studio keeps on the side.
 */
export async function weeklyAvailability(studioId: string): Promise<SlotAvailability[]> {
  const templates = await db.classTemplate.findMany({
    where: { studioId, isActive: true },
    include: {
      instructor: { include: { user: true } },
      location: true,
      recurringBookings: {
        where: { status: { in: ["ACTIVE", "PAUSED"] } },
        include: { student: { include: { user: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const slots: SlotAvailability[] = [];

  for (const template of templates) {
    // A template can run on several weekdays; each is its own slot to a studio.
    for (const weekday of [...template.weekdays].sort((a, b) => a - b)) {
      const fixed = template.recurringBookings.map((booking) => ({
        id: booking.id,
        studentId: booking.studentId,
        studentName: booking.student.user.name,
        status: booking.status,
      }));

      const active = fixed.filter((f) => f.status === "ACTIVE").length;

      slots.push({
        templateId: template.id,
        name: template.name,
        colorHex: template.colorHex,
        weekday,
        startTime: template.startTime,
        durationMins: template.durationMins,
        capacity: template.capacity,
        instructorName: template.instructor?.user.name ?? null,
        locationName: template.location?.name ?? null,
        fixed,
        freeSpots: Math.max(0, template.capacity - active),
      });
    }
  }

  return slots.sort(
    (a, b) =>
      // Monday-first, then by clock time.
      ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || a.startTime.localeCompare(b.startTime),
  );
}
