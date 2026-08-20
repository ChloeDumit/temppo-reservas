/**
 * Seeds the SOCO studio.
 *
 *   npm run seed:soco
 *
 * Independent of the demo studio — running this leaves Estudio Ánima alone,
 * and re-running only resets SOCO.
 *
 * All classes are Pilates Reformer, 50 minutes, on the hour. The data model
 * ties one template to one start time, so each slot is its own template that
 * repeats on its weekdays.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TZ = "America/Montevideo";
const PASSWORD = "soco1234";
const DURATION = 50;

/** Reformer studios are limited by how many machines are on the floor. */
const CAPACITY = 6;

// Weekdays follow JS getDay(): 0 = Sunday … 6 = Saturday.
const MON_WED_FRI = [1, 3, 5];
const TUE_THU = [2, 4];
const SATURDAY = [6];

const SCHEDULE = [
  { weekdays: MON_WED_FRI, hours: [8, 9, 10, 16, 17, 18, 19, 20], teacher: "romina" },
  { weekdays: TUE_THU, hours: [8, 9, 10, 14, 15, 16, 17, 18, 19], teacher: "romina" },
  { weekdays: SATURDAY, hours: [8, 9, 10, 11], teacher: "bianca" },
] as const;

function hhmm(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function dayKey(offsetDays: number) {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

async function main() {
  console.log("Resetting SOCO…");
  await db.studio.deleteMany({ where: { slug: "soco" } });

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const studio = await db.studio.create({
    data: {
      name: "SOCO",
      slug: "soco",
      timezone: TZ,
      currency: "UYU",
      locale: "es",
      plan: "TRIAL",
      trialEndsAt: new Date(Date.now() + 30 * 86_400_000),
      cancellationCutoffHours: 6,
      reminderHoursBefore: 12,
      waitlistClaimWindowMins: 15,
      noShowLimit: 3,
      bookingOpensDaysAhead: 30,
      onboardingCompletedAt: new Date(),
    },
  });

  const location = await db.location.create({
    data: { studioId: studio.id, name: "SOCO" },
  });

  await db.user.create({
    data: {
      studioId: studio.id,
      email: "owner@soco.uy",
      name: "SOCO",
      role: "OWNER",
      passwordHash,
      emailVerified: new Date(),
    },
  });

  const teachers: Record<string, string> = {};
  for (const [key, name, color] of [
    ["romina", "Romina", "#E07A5F"],
    ["bianca", "Bianca", "#8A9A7B"],
  ] as const) {
    const user = await db.user.create({
      data: {
        studioId: studio.id,
        email: `${key}@soco.uy`,
        name,
        role: "INSTRUCTOR",
        passwordHash,
        emailVerified: new Date(),
        instructorProfile: { create: { colorHex: color } },
      },
      include: { instructorProfile: true },
    });
    teachers[key] = user.instructorProfile!.id;
  }

  // Backdated so this week's classes already exist rather than starting Monday.
  const startDate = new Date(`${dayKey(-7)}T00:00:00Z`);
  let created = 0;

  for (const block of SCHEDULE) {
    for (const hour of block.hours) {
      await db.classTemplate.create({
        data: {
          studioId: studio.id,
          locationId: location.id,
          instructorId: teachers[block.teacher],
          name: "Pilates Reformer",
          colorHex: block.teacher === "romina" ? "#E07A5F" : "#8A9A7B",
          capacity: CAPACITY,
          durationMins: DURATION,
          weekdays: [...block.weekdays],
          startTime: hhmm(hour),
          startDate,
        },
      });
      created++;
    }
  }

  await Promise.all([
    db.classPack.create({
      data: {
        studioId: studio.id,
        name: "4 clases / mes",
        credits: 4,
        priceCents: 200000,
        validityDays: 30,
      },
    }),
    db.classPack.create({
      data: {
        studioId: studio.id,
        name: "8 clases / mes",
        description: "El más elegido.",
        credits: 8,
        priceCents: 350000,
        validityDays: 30,
      },
    }),
    db.classPack.create({
      data: {
        studioId: studio.id,
        name: "12 clases / mes",
        credits: 12,
        priceCents: 480000,
        validityDays: 30,
      },
    }),
  ]);

  const perWeek =
    SCHEDULE[0].hours.length * 3 + SCHEDULE[1].hours.length * 2 + SCHEDULE[2].hours.length;

  console.log(`
  SOCO ready

  Log in            owner@soco.uy / ${PASSWORD}
  Romina            romina@soco.uy / ${PASSWORD}
  Bianca            bianca@soco.uy / ${PASSWORD}

  ${created} recurring classes, ${perWeek} classes a week
  Pilates Reformer · ${DURATION} min · ${CAPACITY} lugares

  Lun/Mié/Vie  Romina  08 09 10 · 16 17 18 19 20
  Mar/Jue      Romina  08 09 10 · 14 15 16 17 18 19
  Sábado       Bianca  08 09 10 11
`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
