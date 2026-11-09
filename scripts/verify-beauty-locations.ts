/**
 * Sucursales in Temppo Beauty: shifts worked at one location (or at any),
 * times offered per location, bookings that remember where, and the agenda
 * narrowed to the location in view.
 * Run with: npx tsx scripts/verify-beauty-locations.ts
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never;

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

let passed = 0;
let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
  ok ? passed++ : failed++;
}

const SLUG = "verify-beauty-locations";

async function main() {
  const { availabilityQuery } = await import("../src/lib/appointments/availability");
  const { findSlots } = await import("../src/lib/appointments/slots");
  const { bookAppointment } = await import("../src/lib/appointments/book");
  const { findOrCreateClient } = await import("../src/lib/appointments/clients");
  const { appointmentLocationScope, bookingLocation } = await import("../src/lib/locations");
  const { wallTimeToUtc, formatTime } = await import("../src/lib/dates");

  const TZ = "America/Montevideo";
  const now = wallTimeToUtc("2026-10-16", "12:00", TZ); // Friday
  const MON = "2026-10-19";
  const at = (time: string) => wallTimeToUtc(MON, time, TZ);

  await db.studio.deleteMany({ where: { slug: SLUG } });
  const studio = await db.studio.create({
    data: { name: "Salón Verify", slug: SLUG, brand: "beauty", vertical: "APPOINTMENTS", minNoticeMinutes: 60, slotStepMinutes: 60 },
  });

  try {
    console.log("\nUna sola sucursal");
    const centro = await db.location.create({ data: { studioId: studio.id, name: "Centro", address: "18 de Julio 1234" } });
    check("with one location, a booking needs none", await bookingLocation(studio.id, undefined), null);

    const pocitos = await db.location.create({ data: { studioId: studio.id, name: "Pocitos" } });
    console.log("\nDos sucursales");
    check("now one is required", await bookingLocation(studio.id, undefined), undefined);
    check("and must be hers", await bookingLocation(studio.id, "not-a-location"), undefined);
    check("a valid one is accepted", await bookingLocation(studio.id, pocitos.id), pocitos.id);

    const ana = await db.user.create({ data: { studioId: studio.id, email: "ana@locations.test", name: "Ana", role: "OWNER" } });
    const bea = await db.user.create({ data: { studioId: studio.id, email: "bea@locations.test", name: "Bea", role: "INSTRUCTOR" } });
    const cami = await db.user.create({ data: { studioId: studio.id, email: "cami@locations.test", name: "Cami", role: "INSTRUCTOR" } });
    await db.workingHours.createMany({
      data: [
        // Ana mornings in Centro, Bea mornings in Pocitos, Cami afternoons wherever she is booked.
        { studioId: studio.id, staffId: ana.id, weekday: 1, startMin: 540, endMin: 720, locationId: centro.id },
        { studioId: studio.id, staffId: bea.id, weekday: 1, startMin: 540, endMin: 720, locationId: pocitos.id },
        { studioId: studio.id, staffId: cami.id, weekday: 1, startMin: 840, endMin: 960, locationId: null },
      ],
    });
    const service = await db.service.create({ data: { studioId: studio.id, name: "Semipermanente", durationMin: 60, priceCents: 90000 } });

    const times = async (locationId: string | null) => {
      const found = await availabilityQuery(studio, { serviceId: service.id, staffId: null, locationId, fromDate: MON, days: 1, now });
      return findSlots(found!.query)[0].slots.map((s) => [
        formatTime(s.start, TZ, "es"),
        s.staffIds.map((id) => (id === ana.id ? "Ana" : id === bea.id ? "Bea" : "Cami")).join("+"),
      ]);
    };
    check("in Centro: Ana's mornings and Cami's afternoon", await times(centro.id), [
      ["09:00", "Ana"],
      ["10:00", "Ana"],
      ["11:00", "Ana"],
      ["14:00", "Cami"],
      ["15:00", "Cami"],
    ]);
    check("in Pocitos: Bea's mornings and Cami's afternoon", (await times(pocitos.id)).map((t) => t.join(" ")), [
      "09:00 Bea",
      "10:00 Bea",
      "11:00 Bea",
      "14:00 Cami",
      "15:00 Cami",
    ]);

    console.log("\nReservar");
    const { profile } = await findOrCreateClient(studio.id, { name: "Lucía", phone: "099 555 111" });
    const booked = await bookAppointment({
      studio,
      clientId: profile.id,
      serviceId: service.id,
      staffId: null,
      locationId: pocitos.id,
      startsAt: at("10:00"),
      source: "CLIENT_PUBLIC",
      collectDeposit: false,
      now,
    });
    const appt = booked.ok ? await db.appointment.findUniqueOrThrow({ where: { id: booked.appointmentId } }) : null;
    check("«cualquiera» in Pocitos goes to Bea, and the booking says where", [appt?.staffId === bea.id, appt?.locationId], [true, pocitos.id]);
    const wrongPlace = await bookAppointment({
      studio,
      clientId: profile.id,
      serviceId: service.id,
      staffId: ana.id,
      locationId: pocitos.id,
      startsAt: at("11:00"),
      source: "CLIENT_PUBLIC",
      collectDeposit: false,
      now,
    });
    check("Ana cannot be booked in Pocitos, where she does not work", wrongPlace.ok ? "booked" : wrongPlace.code, "UNAVAILABLE");
    const cami1 = await bookAppointment({
      studio,
      clientId: profile.id,
      serviceId: service.id,
      staffId: cami.id,
      locationId: centro.id,
      startsAt: at("14:00"),
      source: "CLIENT_PUBLIC",
      collectDeposit: false,
      now,
    });
    check("Cami booked in Centro at 14:00", cami1.ok, true);
    check("is no longer free at 14:00 in Pocitos either: she is one person", (await times(pocitos.id)).map((t) => t[0]).includes("14:00"), false);

    console.log("\nLa agenda por sucursal");
    await db.appointment.create({
      data: {
        studioId: studio.id,
        staffId: ana.id,
        clientId: profile.id,
        serviceName: "De antes",
        startsAt: at("09:00"),
        endsAt: at("10:00"),
        blockedUntil: at("10:00"),
        status: "CONFIRMED",
        source: "STAFF",
        priceCents: 0,
        manageTokenHash: "verify-locations-before",
      },
    });
    const names = async (locationId: string | null) =>
      (
        await db.appointment.findMany({
          where: { studioId: studio.id, ...appointmentLocationScope(locationId) },
          orderBy: { startsAt: "asc" },
          select: { serviceName: true, startsAt: true },
        })
      ).map((a) => `${formatTime(a.startsAt, TZ, "es")} ${a.serviceName}`);
    check("Pocitos shows its own, and the one from before there were several", await names(pocitos.id), ["09:00 De antes", "10:00 Semipermanente"]);
    check("Centro likewise", await names(centro.id), ["09:00 De antes", "14:00 Semipermanente"]);
    check("all of them together", (await names(null)).length, 3);
  } finally {
    await db.studio.deleteMany({ where: { slug: SLUG } });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  await db.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
