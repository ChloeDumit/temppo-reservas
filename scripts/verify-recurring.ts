/**
 * Standing weekly spots: materialising into occurrences, capacity accounting,
 * date windows, pausing and releasing.
 * Run with: npx tsx scripts/verify-recurring.ts
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const req = createRequire(import.meta.url);
const p = req.resolve("server-only");
req.cache[p] = { id: p, filename: p, loaded: true, exports: {} } as never;

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

let passed = 0;
let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(
    `${ok ? "  ok  " : " FAIL "} ${label}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`,
  );
  ok ? passed++ : failed++;
}

async function main() {
  const { syncRecurringBookings, weeklyAvailability } = await import("../src/lib/recurring");
  const { bookClass } = await import("../src/lib/booking");

  await db.studio.deleteMany({ where: { slug: "recurring-scratch" } });
  const studio = await db.studio.create({
    data: {
      name: "Recurring Scratch",
      slug: "recurring-scratch",
      timezone: "America/Montevideo",
      bookingOpensDaysAhead: 30,
      noShowLimit: 0,
    },
  });

  const mkStudent = async (name: string) => {
    const user = await db.user.create({
      data: {
        studioId: studio.id,
        email: `${name}@rec.test`,
        name,
        role: "STUDENT",
        studentProfile: { create: {} },
      },
      include: { studentProfile: true },
    });
    return user.studentProfile!;
  };

  const [ana, beto, caro] = await Promise.all([
    mkStudent("ana"),
    mkStudent("beto"),
    mkStudent("caro"),
  ]);

  // Template with 2 seats so capacity limits are easy to hit.
  const template = await db.classTemplate.create({
    data: {
      studioId: studio.id,
      name: "Reformer",
      capacity: 2,
      durationMins: 55,
      weekdays: [1, 3],
      startTime: "17:00",
      startDate: new Date("2026-01-01T00:00:00Z"),
    },
  });

  // Three future occurrences of that slot.
  const base = Date.now() + 2 * 86_400_000;
  const instances = await Promise.all(
    [0, 7, 14].map((offset) =>
      db.classInstance.create({
        data: {
          studioId: studio.id,
          templateId: template.id,
          name: "Reformer",
          startsAt: new Date(base + offset * 86_400_000),
          endsAt: new Date(base + offset * 86_400_000 + 55 * 60_000),
          capacity: 2,
        },
      }),
    ),
  );

  console.log("\nMaterialising standing spots");

  await db.recurringBooking.create({
    data: {
      studioId: studio.id,
      classTemplateId: template.id,
      studentId: ana.id,
      status: "ACTIVE",
      startDate: new Date("2026-01-01T00:00:00Z"),
    },
  });

  const created = await syncRecurringBookings(studio);
  check("a standing spot books every future occurrence", created, 3);

  const anaBookings = await db.booking.count({
    where: { studentId: ana.id, status: "BOOKED", source: "RECURRING" },
  });
  check("bookings are tagged as recurring", anaBookings, 3);

  const again = await syncRecurringBookings(studio);
  check("running the sync twice creates nothing new", again, 0);

  console.log("\nCapacity");

  await db.recurringBooking.create({
    data: {
      studioId: studio.id,
      classTemplateId: template.id,
      studentId: beto.id,
      status: "ACTIVE",
      startDate: new Date("2026-01-01T00:00:00Z"),
    },
  });
  await syncRecurringBookings(studio);

  const seats = await db.booking.count({
    where: { classInstanceId: instances[0].id, status: "BOOKED" },
  });
  check("two standing spots fill a 2-seat class", seats, 2);

  // Casual booking must now be locked out — the seats are spoken for.
  const casual = await bookClass({
    studio,
    studentId: caro.id,
    classInstanceId: instances[0].id,
    source: "ADMIN",
    bypassWindow: true,
  });
  check("standing spots block casual booking", casual.ok === false && casual.code, "CLASS_FULL");

  console.log("\nAvailability view");

  let slots = await weeklyAvailability(studio.id);
  check("one slot per weekday the template runs", slots.length, 2);
  check("slots are Monday first", [slots[0].weekday, slots[1].weekday], [1, 3]);
  check("standing spots counted", slots[0].fixed.length, 2);
  check("no free spots left", slots[0].freeSpots, 0);

  console.log("\nPausing");

  const betoSpot = await db.recurringBooking.findFirstOrThrow({
    where: { studentId: beto.id },
  });
  await db.recurringBooking.update({ where: { id: betoSpot.id }, data: { status: "PAUSED" } });
  // Mirrors toggleStandingSpotAction: pausing also releases the seats it held.
  await db.booking.updateMany({
    where: { recurringBookingId: betoSpot.id, status: "BOOKED" },
    data: { status: "CANCELLED" },
  });

  const freedByPause = await db.booking.count({
    where: { classInstanceId: instances[0].id, status: "BOOKED" },
  });
  check("pausing gives the seat back to the class", freedByPause, 1);

  slots = await weeklyAvailability(studio.id);
  check("a paused spot frees the place", slots[0].freeSpots, 1);
  check("but is still listed", slots[0].fixed.length, 2);

  console.log("\nDate windows");

  const ended = await db.recurringBooking.findFirstOrThrow({ where: { studentId: ana.id } });
  await db.recurringBooking.update({
    where: { id: ended.id },
    // Ends before any of the occurrences above.
    data: { endDate: new Date("2026-01-02T00:00:00Z") },
  });

  await db.booking.deleteMany({ where: { studentId: ana.id } });
  const afterEnd = await syncRecurringBookings(studio);
  check("an ended spot books nothing", afterEnd, 0);

  await db.recurringBooking.update({
    where: { id: ended.id },
    data: { endDate: null, status: "ACTIVE" },
  });
  const restored = await syncRecurringBookings(studio);
  check("clearing the end date restores the bookings", restored, 3);

  console.log("\nReleasing");

  await db.recurringBooking.update({ where: { id: ended.id }, data: { status: "CANCELLED" } });
  await db.booking.updateMany({
    where: { recurringBookingId: ended.id, status: "BOOKED" },
    data: { status: "CANCELLED" },
  });

  const remaining = await db.booking.count({
    where: { classInstanceId: instances[0].id, status: "BOOKED" },
  });
  check("releasing frees the seats it held", remaining, 0);

  const noRevive = await syncRecurringBookings(studio);
  check("a cancelled spot is not re-created", noRevive, 0);

  await db.studio.delete({ where: { id: studio.id } });
  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
