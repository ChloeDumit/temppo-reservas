/**
 * Exercises waitlist automation: queueing, auto-offer on cancellation,
 * the claim window, expiry, and pass-down to the next student.
 * Run with: npx tsx scripts/verify-waitlist.ts
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

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
  console.log(
    `${ok ? "  ok  " : " FAIL "} ${label}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`,
  );
  ok ? passed++ : failed++;
}

async function main() {
  const { bookClass, cancelBooking } = await import("../src/lib/booking");
  const { joinWaitlist, offerNextSpot, sweepExpiredOffers } = await import("../src/lib/waitlist");

  await db.studio.deleteMany({ where: { slug: "waitlist-scratch" } });

  const studio = await db.studio.create({
    data: {
      name: "Waitlist Scratch",
      slug: "waitlist-scratch",
      timezone: "America/Montevideo",
      locale: "es",
      cancellationCutoffHours: 6,
      bookingOpensDaysAhead: 30,
      waitlistClaimWindowMins: 15,
      noShowLimit: 0,
    },
  });

  const pack = await db.classPack.create({
    data: { studioId: studio.id, name: "10x", credits: 10, priceCents: 1000, validityDays: 30 },
  });

  const mkStudent = async (name: string) => {
    const user = await db.user.create({
      data: {
        studioId: studio.id,
        email: `${name}@wl.test`,
        name,
        role: "STUDENT",
        studentProfile: { create: {} },
      },
      include: { studentProfile: true },
    });
    await db.studentPack.create({
      data: {
        studioId: studio.id,
        studentId: user.studentProfile!.id,
        packId: pack.id,
        creditsTotal: 10,
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 20 * 86_400_000),
      },
    });
    return user.studentProfile!;
  };

  const [holder, first, second] = await Promise.all([
    mkStudent("holder"),
    mkStudent("first"),
    mkStudent("second"),
  ]);

  const klass = await db.classInstance.create({
    data: {
      studioId: studio.id,
      name: "Full class",
      startsAt: new Date(Date.now() + 48 * 3_600_000),
      endsAt: new Date(Date.now() + 49 * 3_600_000),
      capacity: 1,
    },
  });

  const seat = await bookClass({ studio, studentId: holder.id, classInstanceId: klass.id });
  check("class starts full", seat.ok, true);

  console.log("\nQueueing");

  const j1 = await joinWaitlist({
    studioId: studio.id,
    classInstanceId: klass.id,
    studentId: first.id,
  });
  const j2 = await joinWaitlist({
    studioId: studio.id,
    classInstanceId: klass.id,
    studentId: second.id,
  });
  check("first in line gets position 1", j1.entry.position, 1);
  check("second in line gets position 2", j2.entry.position, 2);

  const rejoin = await joinWaitlist({
    studioId: studio.id,
    classInstanceId: klass.id,
    studentId: first.id,
  });
  check("joining twice does not duplicate", rejoin.alreadyOn, true);

  const noRoom = await offerNextSpot({ studio, classInstanceId: klass.id });
  check("no offer while the class is still full", noRoom, null);

  console.log("\nAuto-offer on cancellation");

  if (seat.ok) {
    await cancelBooking({ studio, bookingId: seat.bookingId });
    const offered = await offerNextSpot({ studio, classInstanceId: klass.id });
    check("the freed spot is offered to the first in line", offered?.studentId, first.id);
  }

  const firstEntry = await db.waitlistEntry.findUniqueOrThrow({
    where: { classInstanceId_studentId: { classInstanceId: klass.id, studentId: first.id } },
  });
  check("offer is recorded with a claim token", Boolean(firstEntry.claimToken), true);
  check("offer has a deadline", Boolean(firstEntry.offerExpiresAt), true);

  const secondOffer = await offerNextSpot({ studio, classInstanceId: klass.id });
  check("only one live offer at a time", secondOffer, null);

  const secondEntry = await db.waitlistEntry.findUniqueOrThrow({
    where: { classInstanceId_studentId: { classInstanceId: klass.id, studentId: second.id } },
  });
  check("second student is still waiting", secondEntry.status, "WAITING");

  console.log("\nExpiry passes the spot down");

  // Wind the deadline back to simulate the window closing.
  await db.waitlistEntry.update({
    where: { id: firstEntry.id },
    data: { offerExpiresAt: new Date(Date.now() - 60_000) },
  });

  const swept = await sweepExpiredOffers(studio);
  check("one expired offer was swept", swept, 1);

  const afterSweep = await db.waitlistEntry.findMany({
    where: { classInstanceId: klass.id },
    orderBy: { position: "asc" },
  });
  check("expired student is marked EXPIRED", afterSweep[0].status, "EXPIRED");
  check("expired token is cleared", afterSweep[0].claimToken, null);
  check("spot moved to the next student", afterSweep[1].status, "OFFERED");
  check("next student got a claim token", Boolean(afterSweep[1].claimToken), true);

  console.log("\nClaiming");

  const claim = await bookClass({
    studio,
    studentId: second.id,
    classInstanceId: klass.id,
    source: "WAITLIST",
    bypassWindow: true,
  });
  check("claiming books the seat", claim.ok, true);

  const claimed = await db.waitlistEntry.findUniqueOrThrow({
    where: { classInstanceId_studentId: { classInstanceId: klass.id, studentId: second.id } },
  });
  check("claimed entry leaves the queue", claimed.status, "CLAIMED");

  const seats = await db.booking.count({
    where: { classInstanceId: klass.id, status: "BOOKED" },
  });
  check("class is full again with exactly one seat", seats, 1);

  const noneLeft = await offerNextSpot({ studio, classInstanceId: klass.id });
  check("no further offers once full", noneLeft, null);

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
