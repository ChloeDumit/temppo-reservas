/**
 * Letting spaces by the hour.
 * Run with: npx tsx scripts/verify-venues.ts
 *
 * The rules a club would notice first: two people cannot take the same court
 * at eight on a Friday, peak hours cost more than Tuesday morning, and
 * "cualquier cancha" finds one when a named court is taken.
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

let passed = 0;
let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(
    `${ok ? "  ok  " : " FAIL "} ${label}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`,
  );
  ok ? passed++ : failed++;
}

const TZ = "America/Montevideo";
/** Every weekday, so a fixture never depends on the day the suite is run. */
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

async function main() {
  const { rentSpace, cancelRental } = await import("../src/lib/venues/book");
  const { venueAvailabilityQuery } = await import("../src/lib/venues/availability");
  const { rentalPriceCents, bandAt, priceRange } = await import("../src/lib/venues/pricing");
  const { findSlots } = await import("../src/lib/appointments/slots");
  const { wallTimeToUtc, dateKeyInZone } = await import("../src/lib/dates");

  console.log("\nPrice bands");

  const court = {
    priceCentsPerHour: 80_000, // $800
    bands: [
      { weekdays: [5], startMin: 18 * 60, endMin: 23 * 60, priceCentsPerHour: 120_000, label: "Viernes noche" },
    ],
  };

  check("off peak is the base rate", rentalPriceCents(court, 2, 10 * 60, 60), 80_000);
  check("Friday at eight is peak", rentalPriceCents(court, 5, 20 * 60, 60), 120_000);
  check("Friday at five is not", rentalPriceCents(court, 5, 17 * 60, 60), 80_000);
  // The band ends at 23:00, so a 22:59 start is still in it and 23:00 is not.
  check("the band's last minute counts", bandAt(court, 5, 23 * 60 - 1)?.label, "Viernes noche");
  check("and its end does not", bandAt(court, 5, 23 * 60), null);
  check("ninety minutes costs one and a half", rentalPriceCents(court, 2, 10 * 60, 90), 120_000);
  check("priced by the hour it starts", rentalPriceCents(court, 5, 19 * 60 + 30, 90), 180_000);
  check("the range is what a listing shows", priceRange(court), { minCents: 80_000, maxCents: 120_000 });

  console.log("\nA club with three courts");

  const studio = await db.studio.create({
    data: {
      name: "Pádel Verify",
      slug: `padel-${Date.now()}`,
      timezone: TZ,
      vertical: "VENUES",
      minNoticeMinutes: 0,
      slotStepMinutes: 30,
      bookingOpensDaysAhead: 30,
    },
  });

  const mkCourt = (name: string, position: number, bufferAfterMin = 0) =>
    db.space.create({
      data: {
        studioId: studio.id,
        name,
        kind: "Pádel",
        position,
        bufferAfterMin,
        priceCentsPerHour: 80_000,
        durationsMin: [60, 90],
        hours: {
          create: ALL_DAYS.map((weekday) => ({ weekday, startMin: 8 * 60, endMin: 23 * 60 })),
        },
      },
      include: { hours: true, bands: true },
    });

  const one = await mkCourt("Cancha 1", 0);
  const two = await mkCourt("Cancha 2", 1);
  const three = await mkCourt("Cancha 3", 2, 15);

  const settings = {
    id: studio.id,
    timezone: TZ,
    bookingOpensDaysAhead: 30,
    minNoticeMinutes: 0,
    slotStepMinutes: 30,
    holdMinutes: 15,
  };

  // A fixed future day, so nothing depends on the hour the suite runs.
  const day = dateKeyInZone(new Date(Date.now() + 7 * 86_400_000), TZ);
  const at = (hhmm: string) => wallTimeToUtc(day, hhmm, TZ);

  const first = await rentSpace(settings, {
    spaceId: one.id,
    startsAt: at("20:00"),
    durationMin: 60,
    contactName: "Martín",
  });
  check("the first booking is taken", first.ok, true);
  check("and priced at the base rate", first.ok && first.priceCents, 80_000);

  const clash = await rentSpace(settings, {
    spaceId: one.id,
    startsAt: at("20:00"),
    durationMin: 60,
    contactName: "Otro",
  });
  check("the same court at the same hour is refused", clash.ok === false && clash.code, "UNAVAILABLE");

  // The overlap has to be caught, not just the exact repeat.
  const overlap = await rentSpace(settings, {
    spaceId: one.id,
    startsAt: at("20:30"),
    durationMin: 60,
    contactName: "Otro",
  });
  check("so is a booking that merely overlaps", overlap.ok === false && overlap.code, "UNAVAILABLE");

  const nextDoor = await rentSpace(settings, {
    spaceId: two.id,
    startsAt: at("20:00"),
    durationMin: 60,
    contactName: "Vecino",
  });
  check("the court next door is free", nextDoor.ok, true);

  console.log("\nCualquier cancha");

  const any = await rentSpace(settings, {
    startsAt: at("20:00"),
    durationMin: 60,
    contactName: "Sin preferencia",
    source: "ONLINE",
  });
  check("finds the one still free", any.ok && any.spaceId, three.id);

  const noneLeft = await rentSpace(settings, {
    startsAt: at("20:00"),
    durationMin: 60,
    contactName: "Tarde",
    source: "ONLINE",
  });
  check("and refuses once every court is taken", noneLeft.ok === false && noneLeft.code, "UNAVAILABLE");

  console.log("\nTurnaround");

  // Court three has 15 minutes of sweeping after each booking: 20:00–21:00
  // blocks until 21:15, so 21:00 is gone and 21:30 is the next start.
  const sweeping = await venueAvailabilityQuery(settings, {
    spaceIds: [three.id],
    durationMin: 60,
    fromDate: day,
    days: 1,
  });
  const starts = sweeping
    ? findSlots(sweeping.query)[0].slots.map((s) => s.start.getTime())
    : [];
  check("the slot right after is blocked", starts.includes(at("21:00").getTime()), false);
  check("the next one on the grid is free", starts.includes(at("21:30").getTime()), true);
  check("and so is the hour before", starts.includes(at("19:00").getTime()), true);

  console.log("\nLengths");

  const halfDay = await rentSpace(settings, {
    spaceId: two.id,
    startsAt: at("09:00"),
    durationMin: 240,
    contactName: "Cumpleaños",
  });
  check("a length the space does not offer is refused", halfDay.ok === false && halfDay.code, "BAD_DURATION");

  const ninety = await rentSpace(settings, {
    spaceId: two.id,
    startsAt: at("09:00"),
    durationMin: 90,
    contactName: "Ana",
  });
  check("ninety minutes is let", ninety.ok, true);
  check("and costs an hour and a half", ninety.ok && ninety.priceCents, 120_000);

  console.log("\nClosing time and blocks");

  // Courts shut at 23:00, so 22:30 cannot fit ninety minutes.
  const afterHours = await rentSpace(settings, {
    spaceId: one.id,
    startsAt: at("22:30"),
    durationMin: 90,
    contactName: "Nocturno",
  });
  check("a booking that runs past closing is refused", afterHours.ok === false && afterHours.code, "UNAVAILABLE");

  await db.timeOff.create({
    data: {
      studioId: studio.id,
      spaceId: one.id,
      startsAt: at("10:00"),
      endsAt: at("12:00"),
      reason: "Mantenimiento",
    },
  });

  const maintenance = await rentSpace(settings, {
    spaceId: one.id,
    startsAt: at("10:00"),
    durationMin: 60,
    contactName: "Nadie",
    source: "ONLINE",
  });
  check("a court under maintenance is closed online", maintenance.ok === false && maintenance.code, "UNAVAILABLE");

  const insisted = await rentSpace(settings, {
    spaceId: one.id,
    startsAt: at("10:00"),
    durationMin: 60,
    contactName: "El dueño igual la pone",
    allowBlocked: true,
  });
  check("but staff may still place it", insisted.ok, true);

  // The block is on court one only.
  const elsewhere = await rentSpace(settings, {
    spaceId: three.id,
    startsAt: at("10:00"),
    durationMin: 60,
    contactName: "Otra cancha",
    source: "ONLINE",
  });
  check("the block does not spread to the others", elsewhere.ok, true);

  console.log("\nCancelling frees the court");

  check("the court is busy", (await rentSpace(settings, {
    spaceId: two.id, startsAt: at("09:00"), durationMin: 90, contactName: "Choque",
  })).ok, false);

  check("cancelling succeeds", await cancelRental(studio.id, ninety.ok ? ninety.rentalId : "", null), true);

  const reused = await rentSpace(settings, {
    spaceId: two.id,
    startsAt: at("09:00"),
    durationMin: 90,
    contactName: "Después de cancelar",
  });
  check("and the slot can be let again", reused.ok, true);

  console.log("\nThe minimum notice is a rule for the public, not the counter");

  /*
    Caught at the counter: the club asks for an hour's notice, someone walked
    in at five past five wanting the six o'clock court, and the agenda refused
    it as "already taken". The notice exists so an online booking does not land
    on a club with no warning; it has nothing to say about the person standing
    there.
  */
  const shortNotice = { ...settings, minNoticeMinutes: 120 };
  // Half past three on the fixture day, asking for four: inside two hours'
  // notice. The clock is passed in rather than read, so this holds whatever
  // time the suite is run at.
  const standingThere = at("15:30");

  const online = await rentSpace(shortNotice, {
    spaceId: three.id,
    startsAt: at("16:00"),
    durationMin: 60,
    contactName: "Desde el celular",
    source: "ONLINE",
    now: standingThere,
  });
  check("online still honours the notice", online.ok === false && online.code, "UNAVAILABLE");

  const counter = await rentSpace(shortNotice, {
    spaceId: three.id,
    startsAt: at("16:00"),
    durationMin: 60,
    contactName: "En el mostrador",
    now: standingThere,
  });
  check("the counter takes it anyway", counter.ok, true);

  console.log("\nKinds do not bleed into each other");

  /*
    Both bugs the browser caught on the first run: "cualquiera" reached across
    kinds, so a padel booking could be handed a five-a-side pitch and quoted
    its price. The kind has to narrow the query on the server, not just the
    buttons on the page.
  */
  const pitch = await db.space.create({
    data: {
      studioId: studio.id,
      name: "Fútbol 5",
      kind: "Fútbol 5",
      position: 9,
      priceCentsPerHour: 220_000,
      durationsMin: [60],
      hours: { create: ALL_DAYS.map((weekday) => ({ weekday, startMin: 8 * 60, endMin: 24 * 60 - 1 })) },
    },
  });

  const padelOnly = await rentSpace(settings, {
    kind: "Pádel",
    startsAt: at("22:30"),
    durationMin: 60,
    contactName: "Sólo pádel",
    source: "ONLINE",
  });
  // An hour from 22:30 does not fit before the courts shut at 23:00, but it
  // does on the pitch — which is open, and is not what was asked for.
  check("asking for padel never returns a pitch", padelOnly.ok === false && padelOnly.code, "UNAVAILABLE");

  const pitchAsked = await rentSpace(settings, {
    kind: "Fútbol 5",
    startsAt: at("22:30"),
    durationMin: 60,
    contactName: "Fútbol",
    source: "ONLINE",
  });
  check("and asking for a pitch returns one", pitchAsked.ok && pitchAsked.spaceId, pitch.id);

  console.log("\nCualquiera takes the cheapest");

  // Court four is dearer; with every court free, "cualquiera" must not pick it.
  const indoor = await mkCourt("Cancha 4 (techada)", 3);
  await db.space.update({ where: { id: indoor.id }, data: { priceCentsPerHour: 140_000 } });

  const cheap = await rentSpace(settings, {
    kind: "Pádel",
    startsAt: at("15:00"),
    durationMin: 60,
    contactName: "Mira el precio",
    source: "ONLINE",
  });
  check("the dearer court is not chosen while cheaper ones are free", cheap.ok && cheap.spaceId !== indoor.id, true);
  check("and the price quoted is the cheap one", cheap.ok && cheap.priceCents, 80_000);

  console.log("\nThe manage link");

  check("every booking gets a token", Boolean(first.ok && first.manageToken), true);
  const stored = await db.rental.findUnique({ where: { id: first.ok ? first.rentalId : "" } });
  check(
    "and only its hash is stored",
    Boolean(stored && first.ok && stored.manageTokenHash !== first.manageToken),
    true,
  );

  await db.studio.deleteMany({ where: { id: studio.id } });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  await db.$disconnect();
  if (failed > 0) process.exitCode = 1;
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
