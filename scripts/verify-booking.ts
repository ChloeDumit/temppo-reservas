/**
 * Exercises the booking rules engine against a scratch studio.
 * Run with: npx tsx scripts/verify-booking.ts
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// The engine guards itself with `server-only`, which throws outside Next.
// Pre-seed the module cache with a no-op so this harness can import it.
const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never;

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
  ok ? passed++ : failed++;
}

async function main() {
  // The engine imports "server-only"; load it after stubbing that away.
  const { bookClass, cancelBooking, markAttendance, creditsRemaining } = await import(
    "../src/lib/booking"
  );

  await db.studio.deleteMany({ where: { slug: "verify-scratch" } });

  const studio = await db.studio.create({
    data: {
      name: "Verify Scratch",
      slug: "verify-scratch",
      timezone: "America/Montevideo",
      cancellationCutoffHours: 6,
      bookingOpensDaysAhead: 30,
      noShowLimit: 2,
    },
  });

  const mkStudent = async (email: string) => {
    const user = await db.user.create({
      data: {
        studioId: studio.id,
        email,
        name: email,
        role: "STUDENT",
        studentProfile: { create: {} },
      },
      include: { studentProfile: true },
    });
    return user.studentProfile!;
  };

  const [alice, bob, carol] = await Promise.all([
    mkStudent("alice@verify.test"),
    mkStudent("bob@verify.test"),
    mkStudent("carol@verify.test"),
  ]);

  const pack = await db.classPack.create({
    data: { studioId: studio.id, name: "4x", credits: 4, priceCents: 1000, validityDays: 30 },
  });

  const givePack = (studentId: string, credits = 4) =>
    db.studentPack.create({
      data: {
        studioId: studio.id,
        studentId,
        packId: pack.id,
        creditsTotal: credits,
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 20 * 86_400_000),
      },
    });

  await givePack(alice.id);
  await givePack(bob.id);

  const inHours = (h: number) => new Date(Date.now() + h * 3_600_000);

  // Capacity of 1 so the "last spot" race is easy to force.
  const tight = await db.classInstance.create({
    data: {
      studioId: studio.id,
      name: "Tight",
      startsAt: inHours(48),
      endsAt: inHours(49),
      capacity: 1,
    },
  });

  console.log("\nBooking rules");

  const r1 = await bookClass({ studio, studentId: alice.id, classInstanceId: tight.id });
  check("books with an available credit", r1.ok, true);

  const r2 = await bookClass({ studio, studentId: alice.id, classInstanceId: tight.id });
  check("rejects a duplicate booking", r2.ok === false && r2.code, "ALREADY_BOOKED");

  const r3 = await bookClass({ studio, studentId: bob.id, classInstanceId: tight.id });
  check("rejects when the class is full", r3.ok === false && r3.code, "CLASS_FULL");

  check("credit was spent", await creditsRemaining(alice.id), 3);

  // A roomy class, so the credit check is what actually decides the outcome.
  const roomy = await db.classInstance.create({
    data: {
      studioId: studio.id,
      name: "Roomy",
      startsAt: inHours(50),
      endsAt: inHours(51),
      capacity: 10,
    },
  });
  const r4 = await bookClass({ studio, studentId: carol.id, classInstanceId: roomy.id });
  check("rejects a student with no pack", r4.ok === false && r4.code, "NO_CREDITS");

  const past = await db.classInstance.create({
    data: {
      studioId: studio.id,
      name: "Past",
      startsAt: inHours(-3),
      endsAt: inHours(-2),
      capacity: 5,
    },
  });
  const r5 = await bookClass({ studio, studentId: bob.id, classInstanceId: past.id });
  check("rejects a class that already started", r5.ok === false && r5.code, "IN_PAST");

  const faraway = await db.classInstance.create({
    data: {
      studioId: studio.id,
      name: "Faraway",
      startsAt: inHours(24 * 45),
      endsAt: inHours(24 * 45 + 1),
      capacity: 5,
    },
  });
  const r6 = await bookClass({ studio, studentId: bob.id, classInstanceId: faraway.id });
  check("rejects outside the booking window", r6.ok === false && r6.code, "TOO_EARLY");

  const r7 = await bookClass({
    studio,
    studentId: bob.id,
    classInstanceId: faraway.id,
    source: "ADMIN",
    bypassWindow: true,
  });
  check("staff can book outside the window", r7.ok, true);

  console.log("\nCancellation");

  const early = await db.classInstance.create({
    data: {
      studioId: studio.id,
      name: "Early cancel",
      startsAt: inHours(48),
      endsAt: inHours(49),
      capacity: 5,
    },
  });
  const b1 = await bookClass({ studio, studentId: alice.id, classInstanceId: early.id });
  check("credits after second booking", await creditsRemaining(alice.id), 2);

  if (b1.ok) {
    const c1 = await cancelBooking({ studio, bookingId: b1.bookingId });
    check("in-window cancel refunds", c1.ok && [c1.late, c1.refunded], [false, true]);
    check("credit came back", await creditsRemaining(alice.id), 3);
  }

  const soon = await db.classInstance.create({
    data: {
      studioId: studio.id,
      name: "Late cancel",
      startsAt: inHours(2), // inside the 6h cutoff
      endsAt: inHours(3),
      capacity: 5,
    },
  });
  const b2 = await bookClass({ studio, studentId: alice.id, classInstanceId: soon.id });
  if (b2.ok) {
    const c2 = await cancelBooking({ studio, bookingId: b2.bookingId });
    check("late cancel keeps the credit spent", c2.ok && [c2.late, c2.refunded], [true, false]);
    check("credits after late cancel", await creditsRemaining(alice.id), 2);
  }

  console.log("\nNo-show tracking");

  const attended = await db.classInstance.create({
    data: {
      studioId: studio.id,
      name: "Attendance",
      startsAt: inHours(24),
      endsAt: inHours(25),
      capacity: 5,
    },
  });
  const b3 = await bookClass({ studio, studentId: bob.id, classInstanceId: attended.id });
  if (b3.ok) {
    await markAttendance({ studio, bookingId: b3.bookingId, attended: false });
    let profile = await db.studentProfile.findUnique({ where: { id: bob.id } });
    check("no-show increments the counter", profile?.noShowCount, 1);
    check("under the limit, still allowed to book", profile?.bookingBlocked, false);

    const another = await db.classInstance.create({
      data: {
        studioId: studio.id,
        name: "Attendance 2",
        startsAt: inHours(26),
        endsAt: inHours(27),
        capacity: 5,
      },
    });
    const b4 = await bookClass({ studio, studentId: bob.id, classInstanceId: another.id });
    if (b4.ok) {
      await markAttendance({ studio, bookingId: b4.bookingId, attended: false });
      profile = await db.studentProfile.findUnique({ where: { id: bob.id } });
      check("hitting the limit blocks booking", [profile?.noShowCount, profile?.bookingBlocked], [2, true]);

      // Uses a class with free spots, so BLOCKED is the only reason it can fail.
      const blocked = await bookClass({
        studio,
        studentId: bob.id,
        classInstanceId: roomy.id,
        source: "STUDENT",
      });
      check("blocked student cannot self-book", blocked.ok === false && blocked.code, "BLOCKED");

      const staffOverride = await bookClass({
        studio,
        studentId: bob.id,
        classInstanceId: roomy.id,
        source: "ADMIN",
      });
      check("staff can still book a blocked student", staffOverride.ok, true);

      // Correcting the mark should walk the counter back.
      await markAttendance({ studio, bookingId: b4.bookingId, attended: true });
      profile = await db.studentProfile.findUnique({ where: { id: bob.id } });
      check("correcting a no-show decrements", profile?.noShowCount, 1);
    }
  }

  console.log("\nConcurrency");

  const race = await db.classInstance.create({
    data: {
      studioId: studio.id,
      name: "Race",
      startsAt: inHours(72),
      endsAt: inHours(73),
      capacity: 1,
    },
  });
  const racers = await Promise.all([
    mkStudent("r1@verify.test"),
    mkStudent("r2@verify.test"),
    mkStudent("r3@verify.test"),
  ]);
  await Promise.all(racers.map((r) => givePack(r.id)));

  const results = await Promise.all(
    racers.map((r) =>
      bookClass({ studio, studentId: r.id, classInstanceId: race.id }).catch(() => ({
        ok: false as const,
        code: "CLASS_FULL" as const,
      })),
    ),
  );
  check(
    "only one of three concurrent bookings wins the last spot",
    results.filter((r) => r.ok).length,
    1,
  );

  const seatCount = await db.booking.count({
    where: { classInstanceId: race.id, status: "BOOKED" },
  });
  check("no overbooking in the database", seatCount, 1);

  await db.studio.delete({ where: { id: studio.id } });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
