/**
 * The seña on a court.
 * Run with: npx tsx scripts/verify-venue-deposits.ts
 *
 * A held court has to be as unavailable as a booked one, a hold nobody pays
 * has to come back, and money arriving late has to be handled without either
 * double-booking the court or quietly keeping the cash.
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
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const MINUTE = 60_000;

async function main() {
  const { rentSpace } = await import("../src/lib/venues/book");
  const { settleRentalDeposit, submitRentalTransfer, approveRentalTransfer, expireRentalHolds } =
    await import("../src/lib/venues/payments");
  const { parsePaymentRef, paymentRef } = await import("../src/lib/payments/reference");
  const { wallTimeToUtc, dateKeyInZone } = await import("../src/lib/dates");

  console.log("\nPayment references");

  check("a court's seña round-trips", parsePaymentRef(paymentRef("rental", "r1")), {
    kind: "rental",
    id: "r1",
  });
  // The other kinds must keep working, including the bare ids from before.
  check("an appointment's still does", parsePaymentRef("appt:a1"), { kind: "appt", id: "a1" });
  check("and a bare id is still a pack", parsePaymentRef("p1"), { kind: "pack", id: "p1" });

  const studio = await db.studio.create({
    data: {
      name: "Seña Verify",
      slug: `sena-${Date.now()}`,
      timezone: TZ,
      vertical: "VENUES",
      minNoticeMinutes: 0,
      slotStepMinutes: 30,
      bookingOpensDaysAhead: 30,
      holdMinutes: 15,
    },
  });

  const court = await db.space.create({
    data: {
      studioId: studio.id,
      name: "Cancha 1",
      kind: "Pádel",
      priceCentsPerHour: 100_000,
      durationsMin: [60],
      // Half the hour, up front.
      depositType: "PERCENT",
      depositValue: 50,
      hours: { create: ALL_DAYS.map((weekday) => ({ weekday, startMin: 8 * 60, endMin: 23 * 60 })) },
    },
  });

  const settings = {
    id: studio.id,
    timezone: TZ,
    bookingOpensDaysAhead: 30,
    minNoticeMinutes: 0,
    slotStepMinutes: 30,
    holdMinutes: 15,
  };

  const owner = await db.user.create({
    data: { studioId: studio.id, name: "Dueño", email: "sena@verify.test", role: "OWNER" },
  });
  const mkClient = async (name: string) => {
    const user = await db.user.create({
      data: { studioId: studio.id, name, role: "STUDENT", studentProfile: { create: {} } },
      include: { studentProfile: true },
    });
    return user.studentProfile!.id;
  };

  const day = dateKeyInZone(new Date(Date.now() + 7 * 86_400_000), TZ);
  const at = (hhmm: string) => wallTimeToUtc(day, hhmm, TZ);

  console.log("\nA court held while the seña is paid");

  const clientA = await mkClient("Ana");
  const held = await rentSpace(settings, {
    spaceId: court.id,
    startsAt: at("20:00"),
    durationMin: 60,
    contactName: "Ana",
    clientId: clientA,
    collectDeposit: true,
    source: "ONLINE",
  });

  check("the booking is taken", held.ok, true);
  check("it is held, not confirmed", held.ok && held.pending, true);
  check("the seña is half the hour", held.ok && held.depositCents, 50_000);

  const heldRow = await db.rental.findUnique({ where: { id: held.ok ? held.rentalId : "" } });
  check("the row says so", heldRow?.status, "PENDING_PAYMENT");
  check("and carries a hold", Boolean(heldRow?.holdExpiresAt), true);

  // The whole point: a held court is not an available one.
  const clientB = await mkClient("Bruno");
  const squeeze = await rentSpace(settings, {
    spaceId: court.id,
    startsAt: at("20:00"),
    durationMin: 60,
    contactName: "Bruno",
    clientId: clientB,
    source: "ONLINE",
  });
  check("nobody else can take it meanwhile", squeeze.ok === false && squeeze.code, "UNAVAILABLE");

  console.log("\nThe seña arrives");

  const rentalId = held.ok ? held.rentalId : "";
  await db.payment.create({
    data: {
      studioId: studio.id,
      studentId: clientA,
      rentalId,
      amountCents: 50_000,
      currency: "UYU",
      method: "MERCADO_PAGO",
      status: "PENDING",
      providerPaymentId: "mp-court-1",
    },
  });

  check(
    "a short payment is not enough",
    await settleRentalDeposit({ rentalId, providerPaymentId: "mp-court-1", status: "APPROVED", amountCents: 100 }),
    "ignored",
  );
  check(
    "a rejection leaves the hold alone",
    await settleRentalDeposit({ rentalId, providerPaymentId: "mp-court-1", status: "REJECTED", amountCents: 50_000 }),
    "rejected",
  );
  check(
    "the right amount confirms it",
    await settleRentalDeposit({ rentalId, providerPaymentId: "mp-court-1", status: "APPROVED", amountCents: 50_000 }),
    "confirmed",
  );

  const paid = await db.rental.findUnique({ where: { id: rentalId } });
  check("the court is confirmed", paid?.status, "CONFIRMED");
  check("the seña is marked paid", paid?.depositStatus, "PAID");
  check("and the hold is gone", paid?.holdExpiresAt, null);

  // The provider retries; it must not settle twice.
  check(
    "the same webhook again changes nothing",
    await settleRentalDeposit({ rentalId, providerPaymentId: "mp-court-1", status: "APPROVED", amountCents: 50_000 }),
    "ignored",
  );

  console.log("\nPaying after the hold ran out");

  const clientC = await mkClient("Carla");
  const late = await rentSpace(settings, {
    spaceId: court.id,
    startsAt: at("18:00"),
    durationMin: 60,
    contactName: "Carla",
    clientId: clientC,
    collectDeposit: true,
    source: "ONLINE",
  });
  const lateId = late.ok ? late.rentalId : "";
  await db.payment.create({
    data: {
      studioId: studio.id, studentId: clientC, rentalId: lateId, amountCents: 50_000,
      currency: "UYU", method: "MERCADO_PAGO", status: "PENDING", providerPaymentId: "mp-court-2",
    },
  });

  const afterHold = new Date(Date.now() + 30 * MINUTE);
  // Nobody else took it, so the money is honoured rather than refused.
  check(
    "a late payment on a free court is honoured",
    await settleRentalDeposit({
      rentalId: lateId, providerPaymentId: "mp-court-2", status: "APPROVED", amountCents: 50_000, now: afterHold,
    }),
    "confirmed_late",
  );
  check("and the court is confirmed", (await db.rental.findUnique({ where: { id: lateId } }))?.status, "CONFIRMED");

  console.log("\nPaying late for a court somebody else took");

  const clientD = await mkClient("Diego");
  const doomed = await rentSpace(settings, {
    spaceId: court.id,
    startsAt: at("16:00"),
    durationMin: 60,
    contactName: "Diego",
    clientId: clientD,
    collectDeposit: true,
    source: "ONLINE",
  });
  const doomedId = doomed.ok ? doomed.rentalId : "";

  // The hold lapses and the court is handed back…
  const lapsed = new Date(Date.now() + 30 * MINUTE);
  check("the lapsed hold is closed off", await expireRentalHolds(studio.id, lapsed), 1);
  check(
    "as a cancellation",
    (await db.rental.findUnique({ where: { id: doomedId } }))?.status,
    "CANCELLED",
  );

  // …and somebody else books it.
  const clientE = await mkClient("Elena");
  const tookIt = await rentSpace(settings, {
    spaceId: court.id,
    startsAt: at("16:00"),
    durationMin: 60,
    contactName: "Elena",
    clientId: clientE,
    now: lapsed,
  });
  check("so the court goes to whoever did book it", tookIt.ok, true);

  await db.payment.create({
    data: {
      studioId: studio.id, studentId: clientD, rentalId: doomedId, amountCents: 50_000,
      currency: "UYU", method: "MERCADO_PAGO", status: "PENDING", providerPaymentId: "mp-court-3",
    },
  });
  check(
    "the late money is owed back, not kept quietly",
    await settleRentalDeposit({
      rentalId: doomedId, providerPaymentId: "mp-court-3", status: "APPROVED", amountCents: 50_000, now: lapsed,
    }),
    "paid_too_late",
  );
  check(
    "and it is recorded as received",
    (await db.rental.findUnique({ where: { id: doomedId } }))?.depositStatus,
    "PAID",
  );

  console.log("\nBy transfer");

  const clientF = await mkClient("Flor");
  const byTransfer = await rentSpace(settings, {
    spaceId: court.id,
    startsAt: at("14:00"),
    durationMin: 60,
    contactName: "Flor",
    clientId: clientF,
    collectDeposit: true,
    source: "ONLINE",
  });
  const transferId = byTransfer.ok ? byTransfer.rentalId : "";

  const claim = await submitRentalTransfer(transferId);
  check("the client gets a code to quote", Boolean(claim?.shortCode), true);
  check("asking twice reuses the same one", (await submitRentalTransfer(transferId))?.id, claim?.id);
  check(
    "the court is still only held",
    (await db.rental.findUnique({ where: { id: transferId } }))?.status,
    "PENDING_PAYMENT",
  );

  check("the club approves it", await approveRentalTransfer(claim!.id, owner.id), true);
  check(
    "and the court is confirmed",
    (await db.rental.findUnique({ where: { id: transferId } }))?.status,
    "CONFIRMED",
  );
  check("approving twice is refused", await approveRentalTransfer(claim!.id, owner.id), false);

  console.log("\nA club that asks for nothing");

  const free = await db.space.create({
    data: {
      studioId: studio.id,
      name: "Cancha libre",
      priceCentsPerHour: 100_000,
      durationsMin: [60],
      hours: { create: ALL_DAYS.map((weekday) => ({ weekday, startMin: 8 * 60, endMin: 23 * 60 })) },
    },
  });
  const clientG = await mkClient("Gabi");
  const noDeposit = await rentSpace(settings, {
    spaceId: free.id,
    startsAt: at("20:00"),
    durationMin: 60,
    contactName: "Gabi",
    clientId: clientG,
    collectDeposit: true,
    source: "ONLINE",
  });
  check("confirms straight away", noDeposit.ok && noDeposit.pending, false);
  check("with no seña", noDeposit.ok && noDeposit.depositCents, 0);

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
