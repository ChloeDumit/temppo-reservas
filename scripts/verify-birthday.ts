/**
 * Exercises gifted classes (a seat that spends no credit) and the birthday
 * notice that prompts staff to offer one.
 * Run with: npx tsx scripts/verify-birthday.ts
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const STUDIO_TZ = "America/Montevideo";

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

const SLUG = "verify-birthday";

async function main() {
  const { bookClass, creditsRemaining } = await import("../src/lib/booking");
  const { sendDueReminders } = await import("../src/lib/reminders");
  const { inZone } = await import("../src/lib/dates");

  await db.studio.deleteMany({ where: { slug: SLUG } });

  const studio = await db.studio.create({
    data: {
      name: "Birthday Scratch",
      slug: SLUG,
      timezone: STUDIO_TZ,
      cancellationCutoffHours: 6,
      bookingOpensDaysAhead: 30,
    },
  });

  // An owner, so there is somebody for the notice to reach.
  await db.user.create({
    data: {
      studioId: studio.id,
      email: "owner@verify-birthday.test",
      name: "Owner",
      role: "OWNER",
    },
  });

  const now = new Date();

  const mkStudent = async (email: string, birthDate: Date | null) => {
    const user = await db.user.create({
      data: {
        studioId: studio.id,
        email,
        name: email,
        role: "STUDENT",
        studentProfile: { create: { birthDate } },
      },
      include: { studentProfile: true },
    });
    return user.studentProfile!;
  };

  /*
    Built from the calendar the studio is on, not the machine's. A birthday is
    "today" in Montevideo, and from 21:00 there it is already tomorrow in UTC —
    a fixture built from UTC parts spent every evening looking for a birthday
    the studio had not reached yet, and failed for three hours a day.
  */
  const there = inZone(now, STUDIO_TZ);

  // Same day and month as today, thirty years back.
  const birthday = new Date(Date.UTC(there.getFullYear() - 30, there.getMonth(), there.getDate()));
  // Deliberately not today.
  const otherDay = new Date(Date.UTC(1990, there.getMonth(), there.getDate() === 1 ? 2 : 1));

  const birthdayGirl = await mkStudent("birthday@verify.test", birthday);
  const ordinary = await mkStudent("ordinary@verify.test", otherDay);

  const pack = await db.classPack.create({
    data: { studioId: studio.id, name: "4x", credits: 4, priceCents: 1000, validityDays: 30 },
  });

  const givePack = (studentId: string) =>
    db.studentPack.create({
      data: {
        studioId: studio.id,
        studentId,
        packId: pack.id,
        creditsTotal: 4,
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 20 * 86_400_000),
      },
    });

  await givePack(birthdayGirl.id);
  await givePack(ordinary.id);

  const mkClass = (name: string) => {
    const startsAt = new Date(Date.now() + 48 * 3_600_000);
    return db.classInstance.create({
      data: {
        studioId: studio.id,
        name,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60_000),
        capacity: 10,
        status: "SCHEDULED",
      },
    });
  };

  console.log("\nGifted classes");

  const giftClass = await mkClass("Gift");
  const before = await creditsRemaining(birthdayGirl.id);
  check("starts with four credits", before, 4);

  const gifted = await bookClass({
    studio,
    studentId: birthdayGirl.id,
    classInstanceId: giftClass.id,
    source: "GIFT",
    bypassWindow: true,
    bypassCredit: true,
  });
  check("the gifted booking succeeds", gifted.ok, true);
  check("no credit was spent", await creditsRemaining(birthdayGirl.id), 4);

  const giftRow = await db.booking.findFirst({ where: { classInstanceId: giftClass.id } });
  check("the booking is marked GIFT", giftRow?.source, "GIFT");
  check("it hangs off no pack", giftRow?.studentPackId, null);

  // The ordinary path must still bill.
  const paidClass = await mkClass("Paid");
  await bookClass({
    studio,
    studentId: ordinary.id,
    classInstanceId: paidClass.id,
    source: "ADMIN",
    bypassWindow: true,
  });
  check("a normal staff booking still spends one", await creditsRemaining(ordinary.id), 3);

  // Someone with nothing left can still be gifted a seat.
  const brokeClass = await mkClass("Broke");
  const broke = await mkStudent("broke@verify.test", null);
  const freebie = await bookClass({
    studio,
    studentId: broke.id,
    classInstanceId: brokeClass.id,
    source: "GIFT",
    bypassWindow: true,
    bypassCredit: true,
  });
  check("a student with no pack at all can be gifted a seat", freebie.ok, true);

  console.log("\nBirthday notices");

  const first = await sendDueReminders(now);
  check("today's birthday is reported once", first.birthdays, 1);

  const logged = await db.notificationLog.findMany({
    where: { studioId: studio.id, template: "student_birthday" },
  });
  check("one notice was logged", logged.length, 1);
  check("it points at the right student", logged[0]?.relatedId, birthdayGirl.id);
  check("the student with another birthday is left alone", 
    logged.some((row) => row.relatedId === ordinary.id), false);

  const second = await sendDueReminders(now);
  check("running again the same day sends nothing", second.birthdays, 0);

  await db.studio.deleteMany({ where: { id: studio.id } });
  console.log(`\n${passed} passed, ${failed} failed\n`);
  await db.$disconnect();
  process.exit(failed ? 1 : 0);
}

main();
