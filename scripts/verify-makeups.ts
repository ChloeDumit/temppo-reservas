/**
 * The two membership models: packs, and fixed spots with a monthly swap
 * allowance. Run with: npx tsx scripts/verify-makeups.ts
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const req = createRequire(import.meta.url);
const so = req.resolve("server-only");
req.cache[so] = { id: so, filename: so, loaded: true, exports: {} } as never;

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TZ = "America/Montevideo";

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
  const { bookClass, cancelBooking } = await import("../src/lib/booking");
  const { makeupBalance } = await import("../src/lib/makeups");

  await db.studio.deleteMany({ where: { slug: "makeup-scratch" } });
  const studio = await db.studio.create({
    data: {
      name: "Makeup Scratch",
      slug: "makeup-scratch",
      timezone: TZ,
      cancellationCutoffHours: 6,
      bookingOpensDaysAhead: 60,
      noShowLimit: 0,
      monthlyChangesAllowed: 2,
    },
  });

  const mkStudent = async (name: string) => {
    const user = await db.user.create({
      data: {
        studioId: studio.id,
        email: `${name}@makeup.test`,
        name,
        role: "STUDENT",
        studentProfile: { create: {} },
      },
      include: { studentProfile: true },
    });
    return user.studentProfile!;
  };

  const [fixed, packed] = await Promise.all([mkStudent("fixed"), mkStudent("packed")]);

  /** A class far enough out that cancelling is never late. */
  let seq = 0;
  const makeClass = async (capacity = 5) => {
    seq += 1;
    const startsAt = new Date(Date.now() + (3 + seq) * 86_400_000);
    return db.classInstance.create({
      data: {
        studioId: studio.id,
        name: `Class ${seq}`,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 55 * 60_000),
        capacity,
      },
    });
  };

  /** Simulates the standing-spot sync, which books without touching credits. */
  const bookAsFixedSpot = async (studentId: string, classInstanceId: string) =>
    db.booking.create({
      data: { studioId: studio.id, classInstanceId, studentId, source: "RECURRING" },
    });

  console.log("\nCase A — a student with a pack");

  const pack = await db.classPack.create({
    data: { studioId: studio.id, name: "4 clases", credits: 4, priceCents: 100000 },
  });
  await db.studentPack.create({
    data: {
      studioId: studio.id,
      studentId: packed.id,
      packId: pack.id,
      creditsTotal: 4,
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
    },
  });

  const c1 = await makeClass();
  const booked = await bookClass({ studio, studentId: packed.id, classInstanceId: c1.id });
  check("books with a pack credit", booked.ok && booked.usedPackId !== null, true);
  check("and does not touch make-ups", booked.ok && booked.usedMakeup, false);

  const cancelled = await cancelBooking({ studio, bookingId: (booked as { bookingId: string }).bookingId });
  check("cancelling in the window returns the credit", cancelled.ok && cancelled.refunded, true);
  check("a pack cancellation earns no make-up", cancelled.ok && cancelled.earnedMakeup, false);

  console.log("\nCase B — a student on a fixed spot");

  let balance = await makeupBalance(fixed.id, studio);
  check("starts with none", [balance.available, balance.changesLeft], [0, 2]);

  const f1 = await makeClass();
  const f2 = await makeClass();
  const f3 = await makeClass();

  const b1 = await bookAsFixedSpot(fixed.id, f1.id);
  const b2 = await bookAsFixedSpot(fixed.id, f2.id);
  const b3 = await bookAsFixedSpot(fixed.id, f3.id);

  const r1 = await cancelBooking({ studio, bookingId: b1.id });
  check("first swap earns a make-up", r1.ok && r1.earnedMakeup, true);
  check("and returns no credit — there was none", r1.ok && r1.refunded, false);

  const r2 = await cancelBooking({ studio, bookingId: b2.id });
  check("second swap earns one too", r2.ok && r2.earnedMakeup, true);

  balance = await makeupBalance(fixed.id, studio);
  check("allowance is now spent", balance.changesLeft, 0);
  check("two make-ups in hand", balance.available, 2);

  // The rule the studio actually cares about.
  const r3 = await cancelBooking({ studio, bookingId: b3.id });
  check("a third cancellation earns nothing", r3.ok && r3.earnedMakeup, false);
  check("the class is simply lost", r3.ok && r3.refunded, false);

  console.log("\nSpending a make-up");

  const replacement = await makeClass();
  const swap = await bookClass({
    studio,
    studentId: fixed.id,
    classInstanceId: replacement.id,
  });
  check("books with no pack at all", swap.ok, true);
  check("and spends a make-up", swap.ok && swap.usedMakeup, true);

  balance = await makeupBalance(fixed.id, studio);
  check("one make-up left", balance.available, 1);

  // Two earned, two spent — the third booking must be refused.
  const second = await makeClass();
  await bookClass({ studio, studentId: fixed.id, classInstanceId: second.id });
  const third = await makeClass();
  const denied = await bookClass({ studio, studentId: fixed.id, classInstanceId: third.id });
  check("a student with none left cannot book", denied.ok === false && denied.code, "NO_CREDITS");

  console.log("\nLate cancellation");

  const soon = await db.classInstance.create({
    data: {
      studioId: studio.id,
      name: "Soon",
      // Inside the 6-hour cutoff.
      startsAt: new Date(Date.now() + 2 * 3_600_000),
      endsAt: new Date(Date.now() + 3 * 3_600_000),
      capacity: 5,
    },
  });
  const lateBooking = await bookAsFixedSpot(fixed.id, soon.id);
  const lateCancel = await cancelBooking({ studio, bookingId: lateBooking.id });
  check("a late cancel is marked late", lateCancel.ok && lateCancel.late, true);
  check("and earns nothing", lateCancel.ok && lateCancel.earnedMakeup, false);

  console.log("\nStudio turns swapping off");

  const strict = { ...studio, monthlyChangesAllowed: 0 };
  const s1 = await makeClass();
  const sb = await bookAsFixedSpot(fixed.id, s1.id);
  const sr = await cancelBooking({ studio: strict, bookingId: sb.id });
  check("no allowance means no make-up", sr.ok && sr.earnedMakeup, false);

  await db.studio.delete({ where: { id: studio.id } });
  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch(async (e) => {
    console.error(e);
    await db.studio.deleteMany({ where: { slug: "makeup-scratch" } });
    process.exit(1);
  })
  .finally(() => db.$disconnect());
