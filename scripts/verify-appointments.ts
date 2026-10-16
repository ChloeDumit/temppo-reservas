/**
 * Booking, moving and cancelling appointments against a scratch studio.
 * Run with: npx tsx scripts/verify-appointments.ts
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never;

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
  const { bookAppointment, cancelAppointment, rescheduleAppointment, markAppointment, findByManageToken } =
    await import("../src/lib/appointments/book");
  const { findOrCreateClient } = await import("../src/lib/appointments/clients");
  const { availabilityQuery } = await import("../src/lib/appointments/availability");
  const { findSlots } = await import("../src/lib/appointments/slots");
  const { wallTimeToUtc, formatTime } = await import("../src/lib/dates");

  const TZ = "America/Montevideo";
  await db.studio.deleteMany({ where: { slug: "verify-appointments" } });

  const studio = await db.studio.create({
    data: {
      name: "Uñas Verify",
      slug: "verify-appointments",
      brand: "beauty",
      vertical: "APPOINTMENTS",
      cancellationCutoffHours: 24,
      minNoticeMinutes: 60,
      slotStepMinutes: 30,
      holdMinutes: 15,
      noShowLimit: 2,
      depositRefundable: false,
    },
  });
  const ana = await db.user.create({ data: { studioId: studio.id, email: "ana@v.test", name: "Ana", role: "OWNER" } });
  const bea = await db.user.create({ data: { studioId: studio.id, email: "bea@v.test", name: "Bea", role: "INSTRUCTOR" } });
  for (const pro of [ana, bea]) {
    await db.workingHours.createMany({
      data: [1, 2, 3, 4, 5].map((weekday) => ({ studioId: studio.id, staffId: pro.id, weekday, startMin: 540, endMin: 1080 })),
    });
  }
  const service = await db.service.create({
    data: {
      studioId: studio.id,
      name: "Semipermanente",
      durationMin: 60,
      priceCents: 120000,
      depositType: "PERCENT",
      depositValue: 30,
      bufferAfterMin: 15,
    },
  });
  const art = await db.addOn.create({
    data: { studioId: studio.id, serviceId: service.id, name: "Nail art", durationMin: 30, priceCents: 30000 },
  });

  const now = wallTimeToUtc("2026-10-16", "12:00", TZ); // Friday
  const MON = "2026-10-19";
  const at = (time: string, date = MON) => wallTimeToUtc(date, time, TZ);
  const rules = { ...studio };

  console.log("\nClients");
  const { profile: lucia } = await findOrCreateClient(studio.id, { name: "Lucía", phone: "099 123 456" });
  const { profile: again } = await findOrCreateClient(studio.id, { name: "Lucia P", phone: "+598 99 123 456" });
  check("the same phone written two ways is the same client", again.id, lucia.id);
  const { profile: maria } = await findOrCreateClient(studio.id, { name: "María", phone: "098 000 111", email: "Maria@x.uy" });
  const { profile: maria2 } = await findOrCreateClient(studio.id, { name: "María", phone: "091 999 999", email: "maria@x.uy" });
  check("the same email is the same client whatever the phone", maria2.id, maria.id);

  console.log("\nBooking online");
  const book = (over: Record<string, unknown> = {}) =>
    bookAppointment({
      studio: rules,
      clientId: lucia.id,
      serviceId: service.id,
      staffId: ana.id,
      startsAt: at("10:00"),
      source: "CLIENT_PUBLIC",
      collectDeposit: true,
      now,
      ...over,
    });

  const first = await book({ addOnIds: [art.id] });
  check("a free time is booked", first.ok, true);
  const appt = first.ok ? await db.appointment.findUniqueOrThrow({ where: { id: first.appointmentId }, include: { addOns: true } }) : null;
  check("it waits for the deposit", appt?.status, "PENDING_PAYMENT");
  check("the deposit is 30% of service plus nail art", first.ok && first.depositCents, 45000);
  check("the add-on stretches it to 90 minutes", appt && (appt.endsAt.getTime() - appt.startsAt.getTime()) / 60000, 90);
  check("cleanup keeps the chair for 15 more", appt && (appt.blockedUntil.getTime() - appt.endsAt.getTime()) / 60000, 15);
  check("the add-on is kept with its price at the time", appt?.addOns.map((a) => [a.name, a.priceCents]), [["Nail art", 30000]]);
  check("the hold runs 15 minutes", appt?.holdExpiresAt && (appt.holdExpiresAt.getTime() - now.getTime()) / 60000, 15);

  check("the same time again is no longer offered", await book({ clientId: maria.id }).then((r) => !r.ok && r.code), "UNAVAILABLE");
  check("nor one that overlaps its cleanup", await book({ clientId: maria.id, startsAt: at("11:30") }).then((r) => !r.ok && r.code), "UNAVAILABLE");
  check("but the next free time after cleanup is", await book({ clientId: maria.id, startsAt: at("12:00") }).then((r) => r.ok), true);
  check("inside the notice is refused", await book({ startsAt: at("12:30", "2026-10-16") }).then((r) => !r.ok && r.code), "UNAVAILABLE");
  check("the past is refused", await book({ startsAt: at("09:00", "2026-10-16") }).then((r) => !r.ok && r.code), "IN_PAST");

  const any = await book({ clientId: maria.id, staffId: null, startsAt: at("10:00") });
  check("“cualquiera” at a time Ana is busy goes to Bea", any.ok && (await db.appointment.findUnique({ where: { id: any.appointmentId } }))?.staffId, bea.id);

  console.log("\nThe database has the last word");
  const staffOverlap = await book({ source: "STAFF", collectDeposit: false, startsAt: at("10:30") });
  check("even staff cannot put two clients in one chair", !staffOverlap.ok && staffOverlap.code, "SLOT_TAKEN");
  const staffOutside = await book({ source: "STAFF", collectDeposit: false, startsAt: at("19:00") });
  check("staff can squeeze someone in after hours", staffOutside.ok, true);
  check("a staff booking is confirmed straight away", staffOutside.ok && (await db.appointment.findUnique({ where: { id: staffOutside.appointmentId } }))?.status, "CONFIRMED");

  const race = await Promise.all(
    [lucia.id, maria.id, lucia.id, maria.id].map((clientId) =>
      book({ clientId, staffId: bea.id, startsAt: at("15:00"), source: "STAFF", collectDeposit: false }),
    ),
  );
  check("four at once for the same time: exactly one wins", race.filter((r) => r.ok).length, 1);
  check("the others are told it was taken", race.filter((r) => !r.ok).map((r) => !r.ok && r.code), ["SLOT_TAKEN", "SLOT_TAKEN", "SLOT_TAKEN"]);

  console.log("\nHolds");
  const later = new Date(now.getTime() + 16 * 60000);
  const afterHold = await book({ clientId: maria.id, now: later });
  check("once the hold runs out, the time is free again", afterHold.ok, true);
  check(
    "and the stale hold is marked expired",
    first.ok && (await db.appointment.findUnique({ where: { id: first.appointmentId } }))?.status,
    "EXPIRED",
  );

  const open = await availabilityQuery(rules, { serviceId: service.id, staffId: ana.id, fromDate: MON, days: 1, now: later });
  const offered = findSlots(open!.query)[0].slots.map((s) => formatTime(s.start, TZ, "es"));
  check("the page no longer offers Ana at 10:00", offered.includes("10:00"), false);
  check("nor 9:00, whose cleanup would run into it", offered.includes("09:00"), false);

  console.log("\nCancelling");
  const paid = await book({ clientId: lucia.id, staffId: bea.id, startsAt: at("09:00", "2026-10-20") });
  if (paid.ok) await db.appointment.update({ where: { id: paid.appointmentId }, data: { status: "CONFIRMED", depositStatus: "PAID" } });
  const early = paid.ok && (await cancelAppointment({ studio: rules, appointmentId: paid.appointmentId, by: "client", now }));
  check("in time, the deposit becomes credit (studio keeps no refunds)", early && early.ok && [early.late, early.depositStatus], [false, "CREDIT"]);

  const paid2 = await book({ clientId: lucia.id, staffId: bea.id, startsAt: at("10:00", "2026-10-20") });
  if (paid2.ok) await db.appointment.update({ where: { id: paid2.appointmentId }, data: { status: "CONFIRMED", depositStatus: "PAID" } });
  const lateCancel =
    paid2.ok &&
    (await cancelAppointment({ studio: rules, appointmentId: paid2.appointmentId, by: "client", now: at("12:00", "2026-10-19") }));
  check("inside 24 hours, the deposit is lost", lateCancel && lateCancel.ok && [lateCancel.late, lateCancel.depositStatus], [true, "FORFEITED"]);
  const twice = paid2.ok && (await cancelAppointment({ studio: rules, appointmentId: paid2.appointmentId, by: "client", now }));
  check("cancelling twice is refused", twice && !twice.ok && twice.code, "ALREADY_CANCELLED");

  const paid3 = await book({ clientId: lucia.id, staffId: bea.id, startsAt: at("11:00", "2026-10-20") });
  if (paid3.ok) await db.appointment.update({ where: { id: paid3.appointmentId }, data: { status: "CONFIRMED", depositStatus: "PAID" } });
  const studioCancel =
    paid3.ok &&
    (await cancelAppointment({ studio: rules, appointmentId: paid3.appointmentId, by: "staff", now: at("10:00", "2026-10-20") }));
  check("when the studio cancels, even late, the client loses nothing", studioCancel && studioCancel.ok && [studioCancel.late, studioCancel.depositStatus], [false, "CREDIT"]);

  console.log("\nMoving");
  const mv = await book({ clientId: maria.id, staffId: bea.id, startsAt: at("09:00", "2026-10-21"), source: "STAFF", collectDeposit: false });
  if (mv.ok) {
    const moved = await rescheduleAppointment({ studio: rules, appointmentId: mv.appointmentId, startsAt: at("11:00", "2026-10-21"), by: "client", now });
    check("a client can move to another offered time", moved.ok, true);
    const row = await db.appointment.findUniqueOrThrow({ where: { id: mv.appointmentId } });
    check("it keeps its length and cleanup", [(row.endsAt.getTime() - row.startsAt.getTime()) / 60000, (row.blockedUntil.getTime() - row.endsAt.getTime()) / 60000], [60, 15]);
    const overlap = await rescheduleAppointment({ studio: rules, appointmentId: mv.appointmentId, startsAt: at("15:00"), by: "staff", now });
    check("staff cannot move it onto someone else", !overlap.ok && overlap.code, "SLOT_TAKEN");
    const tooLate = await rescheduleAppointment({
      studio: rules,
      appointmentId: mv.appointmentId,
      startsAt: at("14:00", "2026-10-21"),
      by: "client",
      now: at("20:00", "2026-10-20"),
    });
    check("a client cannot move it inside the cutoff", !tooLate.ok && tooLate.code, "TOO_LATE");
    const self = await rescheduleAppointment({ studio: rules, appointmentId: mv.appointmentId, startsAt: at("11:30", "2026-10-21"), by: "staff", now });
    check("moving half an hour, overlapping only itself, is fine", self.ok, true);
  }

  console.log("\nAfter the appointment");
  const ns1 = await book({ clientId: maria.id, staffId: ana.id, startsAt: at("09:00", "2026-10-22"), source: "STAFF", collectDeposit: false });
  const ns2 = await book({ clientId: maria.id, staffId: ana.id, startsAt: at("11:00", "2026-10-22"), source: "STAFF", collectDeposit: false });
  if (ns1.ok && ns2.ok) {
    await markAppointment({ studio: rules, appointmentId: ns1.appointmentId, outcome: "NO_SHOW" });
    check("one no-show is counted", (await db.studentProfile.findUniqueOrThrow({ where: { id: maria.id } })).noShowCount, 1);
    await markAppointment({ studio: rules, appointmentId: ns1.appointmentId, outcome: "COMPLETED" });
    check("correcting it to attended takes it back", (await db.studentProfile.findUniqueOrThrow({ where: { id: maria.id } })).noShowCount, 0);
    check("and records the visit", (await db.studentProfile.findUniqueOrThrow({ where: { id: maria.id } })).lastVisitAt?.toISOString(), at("09:00", "2026-10-22").toISOString());
    await markAppointment({ studio: rules, appointmentId: ns1.appointmentId, outcome: "NO_SHOW" });
    await markAppointment({ studio: rules, appointmentId: ns2.appointmentId, outcome: "NO_SHOW" });
    check("two no-shows reach the limit and block online booking", (await db.studentProfile.findUniqueOrThrow({ where: { id: maria.id } })).bookingBlocked, true);
    check("so she cannot book online", await book({ clientId: maria.id, startsAt: at("09:00", "2026-10-23") }).then((r) => !r.ok && r.code), "BLOCKED");
  }

  console.log("\nThe manage link");
  if (afterHold.ok) {
    const found = await findByManageToken(afterHold.manageToken);
    check("the token finds its appointment", found?.id, afterHold.appointmentId);
    check("a wrong token finds nothing", await findByManageToken("nope"), null);
    const raw = await db.appointment.findUniqueOrThrow({ where: { id: afterHold.appointmentId } });
    check("only the hash is stored", raw.manageTokenHash === afterHold.manageToken, false);
  }

  await db.studio.delete({ where: { id: studio.id } });
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
