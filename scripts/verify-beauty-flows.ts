/**
 * The rules behind Temppo Beauty's day to day: who a booking belongs to,
 * blocks, charging, closing appointments and voiding stale transfers.
 * Run with: npx tsx scripts/verify-beauty-flows.ts
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never;
console.info = () => {};

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

let passed = 0;
let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
  ok ? passed++ : failed++;
}

async function main() {
  const { findOrCreateClient } = await import("../src/lib/appointments/clients");
  const { bookAppointment, cancelAppointment, rescheduleAppointment, markAppointment } = await import("../src/lib/appointments/book");
  const { recordAppointmentPayment, collectedFor, submitDepositTransfer } = await import("../src/lib/appointments/payments");
  const { closePastAppointments } = await import("../src/lib/appointments/cron");
  const { wallTimeToUtc } = await import("../src/lib/dates");

  const TZ = "America/Montevideo";
  await db.studio.deleteMany({ where: { slug: "verify-beauty-flows" } });
  const studio = await db.studio.create({
    data: { name: "Flows", slug: "verify-beauty-flows", vertical: "APPOINTMENTS", brand: "beauty", minNoticeMinutes: 0, noShowLimit: 1 },
  });
  const owner = await db.user.create({ data: { studioId: studio.id, email: "owner@flows.test", name: "Owner", role: "OWNER" } });
  for (const weekday of [1, 2, 3, 4, 5]) {
    await db.workingHours.create({ data: { studioId: studio.id, staffId: owner.id, weekday, startMin: 540, endMin: 1080 } });
  }
  const service = await db.service.create({
    data: { studioId: studio.id, name: "Uñas", durationMin: 60, priceCents: 100000, depositType: "FIXED", depositValue: 30000 },
  });
  const at = (day: string, time: string) => wallTimeToUtc(day, time, TZ);
  const now = at("2026-11-02", "08:00"); // a Monday morning

  console.log("\nWho a booking belongs to");
  const ana = await findOrCreateClient(studio.id, { name: "Ana", phone: "099 111 222" });
  const again = await findOrCreateClient(studio.id, { name: "Otra", phone: "+598 99 111 222", email: "intruder@x.test" });
  check("the same phone is the same client", again.profile.id, ana.profile.id);
  check("a public booking does not write its email onto her", (await db.user.findUniqueOrThrow({ where: { id: ana.user.id } })).email, null);
  await findOrCreateClient(studio.id, { name: "Ana", phone: "099111222", email: "ana@x.test" }, { trustEmail: true });
  check("staff can fill it in", (await db.user.findUniqueOrThrow({ where: { id: ana.user.id } })).email, "ana@x.test");
  const sneaky = await findOrCreateClient(studio.id, { name: "Nadie", phone: "091000000", email: "owner@flows.test" });
  check("the owner's email never matches a client", sneaky.user.id === owner.id, false);
  check("and is not copied onto the new client", sneaky.user.email, null);

  const book = (startsAt: Date, extra: Record<string, unknown> = {}) =>
    bookAppointment({
      studio,
      clientId: ana.profile.id,
      serviceId: service.id,
      staffId: owner.id,
      startsAt,
      source: "STAFF",
      collectDeposit: false,
      now,
      ...extra,
    });

  console.log("\nBlocks");
  await db.timeOff.create({ data: { studioId: studio.id, staffId: owner.id, startsAt: at("2026-11-03", "10:00"), endsAt: at("2026-11-03", "12:00") } });
  await db.timeOff.create({ data: { studioId: studio.id, staffId: null, startsAt: at("2026-11-04", "00:00"), endsAt: at("2026-11-05", "00:00") } });
  const onBlock = await book(at("2026-11-03", "10:30"));
  check("staff are stopped on her time off", onBlock.ok ? "ok" : onBlock.code, "BLOCKED_TIME");
  const onClosure = await book(at("2026-11-04", "15:00"));
  check("and on a whole-business closure", onClosure.ok ? "ok" : onClosure.code, "BLOCKED_TIME");
  const forced = await book(at("2026-11-03", "10:30"), { allowBlocked: true });
  check("unless they insist", forced.ok, true);
  const free = await book(at("2026-11-03", "14:00"));
  check("a free time books", free.ok, true);
  if (!free.ok) throw new Error("booking failed");
  const moved = await rescheduleAppointment({ studio, appointmentId: free.appointmentId, startsAt: at("2026-11-04", "14:00"), by: "staff", now });
  check("moving onto a closure is stopped too", moved.ok ? "ok" : moved.code, "BLOCKED_TIME");

  console.log("\nCharging");
  await recordAppointmentPayment({ studioId: studio.id, appointmentId: free.appointmentId, amountCents: 40000, method: "CASH", approvedById: owner.id, now });
  await recordAppointmentPayment({ studioId: studio.id, appointmentId: free.appointmentId, amountCents: 60000, method: "BANK_TRANSFER", approvedById: owner.id, now });
  check("what was charged adds up", await collectedFor(free.appointmentId), 100000);
  const income = await db.transaction.aggregate({ where: { studioId: studio.id, type: "INCOME", category: "Servicios" }, _sum: { amountCents: true } });
  check("as income for the service", income._sum.amountCents, 100000);
  const owedRows = await db.payment.count({ where: { appointmentId: free.appointmentId, collectedByStudio: false } });
  check("and never as money the platform owes", owedRows, 0);

  console.log("\nClosing what happened");
  const later = new Date(at("2026-11-03", "15:00").getTime() + 7 * 3_600_000);
  check("a confirmed appointment hours past its end is closed as done", await closePastAppointments(studio, later) >= 1, true);
  check("it is done", (await db.appointment.findUniqueOrThrow({ where: { id: free.appointmentId } })).status, "COMPLETED");
  check("and her last visit is set", Boolean((await db.studentProfile.findUniqueOrThrow({ where: { id: ana.profile.id } })).lastVisitAt), true);

  console.log("\nOutcomes");
  const paid = await bookAppointment({ studio, clientId: ana.profile.id, serviceId: service.id, staffId: owner.id, startsAt: at("2026-11-05", "11:00"), source: "STAFF", collectDeposit: true, now });
  if (!paid.ok) throw new Error("booking failed");
  await db.appointment.update({ where: { id: paid.appointmentId }, data: { status: "CONFIRMED", depositStatus: "PAID" } });
  const early = await markAppointment({ studio, appointmentId: paid.appointmentId, outcome: "NO_SHOW", now });
  check("nothing in the future can be marked", early.ok, false);
  const after = at("2026-11-05", "13:00");
  await markAppointment({ studio, appointmentId: paid.appointmentId, outcome: "NO_SHOW", now: after });
  let row = await db.appointment.findUniqueOrThrow({ where: { id: paid.appointmentId }, include: { client: true } });
  check("a no-show keeps the deposit and blocks her at the limit", [row.depositStatus, row.client.bookingBlocked], ["FORFEITED", true]);
  await markAppointment({ studio, appointmentId: paid.appointmentId, outcome: "COMPLETED", now: after });
  row = await db.appointment.findUniqueOrThrow({ where: { id: paid.appointmentId }, include: { client: true } });
  check("correcting it gives the deposit back and unblocks her", [row.depositStatus, row.client.bookingBlocked], ["PAID", false]);

  console.log("\nTransfers for appointments that are off");
  const held = await bookAppointment({ studio, clientId: ana.profile.id, serviceId: service.id, staffId: owner.id, startsAt: at("2026-11-06", "11:00"), source: "STAFF", collectDeposit: true, now });
  if (!held.ok) throw new Error("booking failed");
  await submitDepositTransfer(held.appointmentId, now);
  await cancelAppointment({ studio, appointmentId: held.appointmentId, by: "staff", now });
  const announced = await db.payment.findFirstOrThrow({ where: { appointmentId: held.appointmentId, method: "BANK_TRANSFER" } });
  check("cancelling voids the transfer she announced", announced.status, "REJECTED");

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
