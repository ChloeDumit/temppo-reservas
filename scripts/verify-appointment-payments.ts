/**
 * Deposits: provider events, staff approval and payouts.
 * Run with: npx tsx scripts/verify-appointment-payments.ts
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
  const { parsePaymentRef, paymentRef } = await import("../src/lib/payments/reference");
  const { bookAppointment } = await import("../src/lib/appointments/book");
  const { settleDeposit, submitDepositTransfer, approveDepositByStaff, owedToStudio, createPayout } = await import(
    "../src/lib/appointments/payments"
  );
  const { wallTimeToUtc } = await import("../src/lib/dates");

  console.log("\nReferences");
  check("an appointment reference round-trips", parsePaymentRef(paymentRef("appt", "abc")), { kind: "appt", id: "abc" });
  check("a pack reference round-trips", parsePaymentRef(paymentRef("pack", "xyz")), { kind: "pack", id: "xyz" });
  check("a bare id from before prefixes is a pack", parsePaymentRef("cm123"), { kind: "pack", id: "cm123" });
  check("nothing is nothing", parsePaymentRef(null), null);

  const TZ = "America/Montevideo";
  await db.studio.deleteMany({ where: { slug: "verify-deposits" } });
  const studio = await db.studio.create({
    data: { name: "Señas Verify", slug: "verify-deposits", vertical: "APPOINTMENTS", brand: "beauty", minNoticeMinutes: 0, holdMinutes: 15 },
  });
  const pro = await db.user.create({ data: { studioId: studio.id, email: "pro@d.test", name: "Pro", role: "OWNER" } });
  await db.workingHours.create({ data: { studioId: studio.id, staffId: pro.id, weekday: 1, startMin: 540, endMin: 1080 } });
  const service = await db.service.create({
    data: { studioId: studio.id, name: "Pestañas", durationMin: 60, priceCents: 200000, depositType: "FIXED", depositValue: 50000 },
  });
  const client = await db.user.create({
    data: { studioId: studio.id, name: "Clienta", phone: "099000111", role: "STUDENT", studentProfile: { create: {} } },
    include: { studentProfile: true },
  });

  const now = wallTimeToUtc("2026-10-16", "12:00", TZ);
  const at = (time: string) => wallTimeToUtc("2026-10-19", time, TZ);
  const book = (time: string, clientId = client.studentProfile!.id) =>
    bookAppointment({
      studio,
      clientId,
      serviceId: service.id,
      staffId: pro.id,
      startsAt: at(time),
      source: "CLIENT_PUBLIC",
      collectDeposit: true,
      now,
    });

  // A checkout as startDepositCheckout would leave it, without calling out.
  const checkout = async (appointmentId: string) =>
    db.payment.create({
      data: {
        studioId: studio.id,
        studentId: client.studentProfile!.id,
        appointmentId,
        amountCents: 50000,
        method: "MERCADO_PAGO",
        provider: "mercadopago",
        providerPaymentId: `pref-${appointmentId}`,
      },
    });

  console.log("\nAn online deposit");
  const a = await book("10:00");
  if (!a.ok) throw new Error("booking failed");
  check("a fixed deposit is asked for", a.depositCents, 50000);
  await checkout(a.appointmentId);

  check(
    "a different amount is ignored",
    await settleDeposit({ appointmentId: a.appointmentId, providerPaymentId: "mp-1", status: "APPROVED", amountCents: 100, now }),
    "ignored",
  );
  check(
    "a rejected card leaves the hold for another try",
    await settleDeposit({ appointmentId: a.appointmentId, providerPaymentId: "mp-0", status: "REJECTED", amountCents: 50000, now }),
    "rejected",
  );
  check("…and the appointment still waits", (await db.appointment.findUniqueOrThrow({ where: { id: a.appointmentId } })).status, "PENDING_PAYMENT");

  await checkout(a.appointmentId);
  check(
    "the approved payment confirms it",
    await settleDeposit({ appointmentId: a.appointmentId, providerPaymentId: "mp-1", status: "APPROVED", amountCents: 50000, now }),
    "confirmed",
  );
  const confirmed = await db.appointment.findUniqueOrThrow({ where: { id: a.appointmentId } });
  check("confirmed, deposit paid, hold cleared", [confirmed.status, confirmed.depositStatus, confirmed.holdExpiresAt], ["CONFIRMED", "PAID", null]);
  check(
    "the same event again changes nothing",
    await settleDeposit({ appointmentId: a.appointmentId, providerPaymentId: "mp-1", status: "APPROVED", amountCents: 50000, now }),
    "already_settled",
  );
  const income = await db.transaction.findMany({ where: { studioId: studio.id, category: "Señas" } });
  check("the income is booked once", income.map((t) => t.amountCents), [50000]);

  console.log("\nPaid after the hold ran out");
  const b = await book("12:00");
  if (!b.ok) throw new Error("booking failed");
  await checkout(b.appointmentId);
  const later = new Date(now.getTime() + 20 * 60_000);
  // Someone else takes the time once the hold has lapsed.
  const other = await db.user.create({
    data: { studioId: studio.id, name: "Otra", phone: "099222333", role: "STUDENT", studentProfile: { create: {} } },
    include: { studentProfile: true },
  });
  const taken = await bookAppointment({
    studio,
    clientId: other.studentProfile!.id,
    serviceId: service.id,
    staffId: pro.id,
    startsAt: at("12:00"),
    source: "STAFF",
    collectDeposit: false,
    now: later,
  });
  check("the lapsed slot can be taken", taken.ok, true);
  check(
    "the late payment is owed back rather than double-booking",
    await settleDeposit({ appointmentId: b.appointmentId, providerPaymentId: "mp-2", status: "APPROVED", amountCents: 50000, now: later }),
    "paid_too_late",
  );
  const late = await db.appointment.findUniqueOrThrow({ where: { id: b.appointmentId } });
  check("it is marked to refund, with a note for staff", [late.depositStatus, Boolean(late.staffNotes?.includes("devolver"))], ["REFUNDED", true]);

  console.log("\nPaid after the hold ran out, slot still free");
  const c = await book("15:00");
  if (!c.ok) throw new Error("booking failed");
  await checkout(c.appointmentId);
  await db.appointment.update({ where: { id: c.appointmentId }, data: { status: "EXPIRED" } });
  check(
    "it simply gets its time back",
    await settleDeposit({ appointmentId: c.appointmentId, providerPaymentId: "mp-3", status: "APPROVED", amountCents: 50000, now: later }),
    "confirmed",
  );

  console.log("\nA transfer");
  const d = await book("16:30");
  if (!d.ok) throw new Error("booking failed");
  const transfer = await submitDepositTransfer(d.appointmentId, now);
  check("it gets a code to quote", Boolean(transfer?.shortCode?.startsWith("TP-")), true);
  const held = await db.appointment.findUniqueOrThrow({ where: { id: d.appointmentId } });
  check("the hold stretches to give her time", held.holdExpiresAt && (held.holdExpiresAt.getTime() - now.getTime()) / 60_000, 120);
  check("asking twice reuses the same payment", (await submitDepositTransfer(d.appointmentId, now))?.id, transfer?.id);
  check("staff approval confirms it", await approveDepositByStaff(transfer!.id, pro.id, now), "confirmed");

  console.log("\nWhat the platform owes");
  const owed = await owedToStudio(studio.id);
  check("only online deposits count, not the transfer", [owed.count, owed.amountCents], [3, 150000]);
  const payout = await createPayout({ studioId: studio.id, createdById: null, reference: "BROU 21/10" });
  check("a payout covers all of it", payout?.amountCents, 150000);
  check("and the balance drops to nothing", (await owedToStudio(studio.id)).amountCents, 0);
  check("nothing left means no empty payout", await createPayout({ studioId: studio.id, createdById: null }), null);

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
