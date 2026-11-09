/**
 * Seeds a club that lets spaces by the hour, for trying the venues product.
 *
 *   npm run seed:padel
 *
 * Independent of the other seeds — re-running only resets this club. Three
 * padel courts, a five-a-side pitch and a hall, so the booking page has to
 * cope with more than one kind of thing and more than one length.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const PASSWORD = "padel1234";
const SLUG = "club-del-este";

/** Weekdays follow JS getDay(): 0 = Sunday … 6 = Saturday. */
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const WEEKNIGHTS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];

const SPACES = [
  {
    name: "Cancha 1",
    kind: "Pádel",
    pricePerHour: 800,
    durations: [60, 90],
    bufferAfterMin: 0,
    open: EVERY_DAY.map((weekday) => ({ weekday, startMin: 8 * 60, endMin: 23 * 60 })),
    // Weeknights after work are what a club actually sells out.
    bands: [
      { label: "Nocturna", weekdays: WEEKNIGHTS, startMin: 18 * 60, endMin: 23 * 60, pricePerHour: 1200 },
      { label: "Fin de semana", weekdays: WEEKEND, startMin: 9 * 60, endMin: 20 * 60, pricePerHour: 1000 },
    ],
  },
  {
    name: "Cancha 2",
    kind: "Pádel",
    pricePerHour: 800,
    durations: [60, 90],
    bufferAfterMin: 0,
    open: EVERY_DAY.map((weekday) => ({ weekday, startMin: 8 * 60, endMin: 23 * 60 })),
    bands: [
      { label: "Nocturna", weekdays: WEEKNIGHTS, startMin: 18 * 60, endMin: 23 * 60, pricePerHour: 1200 },
      { label: "Fin de semana", weekdays: WEEKEND, startMin: 9 * 60, endMin: 20 * 60, pricePerHour: 1000 },
    ],
  },
  {
    // Blaugrana is indoor, so it costs more and sweeps between bookings.
    name: "Cancha 3 (techada)",
    kind: "Pádel",
    pricePerHour: 1000,
    durations: [60, 90],
    bufferAfterMin: 15,
    open: EVERY_DAY.map((weekday) => ({ weekday, startMin: 8 * 60, endMin: 23 * 60 })),
    bands: [{ label: "Nocturna", weekdays: WEEKNIGHTS, startMin: 18 * 60, endMin: 23 * 60, pricePerHour: 1400 }],
  },
  {
    name: "Fútbol 5",
    kind: "Fútbol 5",
    pricePerHour: 1600,
    durations: [60, 90],
    bufferAfterMin: 10,
    capacity: 10,
    open: EVERY_DAY.map((weekday) => ({ weekday, startMin: 9 * 60, endMin: 24 * 60 - 1 })),
    bands: [{ label: "Nocturna", weekdays: WEEKNIGHTS, startMin: 19 * 60, endMin: 23 * 60 + 59, pricePerHour: 2200 }],
  },
  {
    // A hall is let by the afternoon, not by the hour — same model, different
    // lengths, which is the point of keeping durations on the space.
    name: "Salón de eventos",
    kind: "Salón",
    pricePerHour: 1500,
    durations: [240, 300],
    bufferAfterMin: 60,
    capacity: 80,
    open: [...WEEKEND, 5].map((weekday) => ({ weekday, startMin: 12 * 60, endMin: 23 * 60 })),
    bands: [],
  },
];

async function main() {
  console.log("Resetting Club del Este…");
  await db.studio.deleteMany({ where: { slug: SLUG } });

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const studio = await db.studio.create({
    data: {
      name: "Club del Este",
      slug: SLUG,
      vertical: "VENUES",
      plan: "TRIAL",
      trialEndsAt: new Date(Date.now() + 30 * 86_400_000),
      whatsappNumber: "+59899123456",
      accentColor: "#3F7D5C",
      timezone: "America/Montevideo",
      // A court is booked the same day far more often than a class is.
      minNoticeMinutes: 60,
      slotStepMinutes: 30,
      bookingOpensDaysAhead: 21,
      reminderHoursBefore: 3,
      locations: { create: { name: "Club del Este" } },
    },
  });

  await db.user.create({
    data: {
      studioId: studio.id,
      email: "dueno@clubdeleste.uy",
      name: "Diego",
      role: "OWNER",
      passwordHash,
    },
  });

  for (const [position, s] of SPACES.entries()) {
    await db.space.create({
      data: {
        studioId: studio.id,
        name: s.name,
        kind: s.kind,
        capacity: s.capacity ?? null,
        priceCentsPerHour: s.pricePerHour * 100,
        durationsMin: s.durations,
        bufferAfterMin: s.bufferAfterMin,
        position,
        hours: { create: s.open },
        bands: {
          create: s.bands.map((b) => ({
            label: b.label,
            weekdays: b.weekdays,
            startMin: b.startMin,
            endMin: b.endMin,
            priceCentsPerHour: b.pricePerHour * 100,
          })),
        },
      },
    });
  }

  console.log("\nClub del Este is ready.");
  console.log(`  Owner         dueno@clubdeleste.uy / ${PASSWORD}`);
  console.log("  Log in        http://localhost:3000/es/login");
  console.log(`  Booking page  http://localhost:3000/es/r/${SLUG}`);
  console.log(`\n  ${SPACES.length} spaces: ${SPACES.map((s) => s.name).join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
