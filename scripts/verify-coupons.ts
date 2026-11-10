/**
 * Discount coupons: the arithmetic, when a code applies, and a booking that
 * uses one — price and deposit after the discount, the code kept.
 * Run with: npx tsx scripts/verify-coupons.ts
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

const SLUG = "verify-coupons";

async function main() {
  const { checkCoupon, discountFor, normalizeCode } = await import("../src/lib/coupons");
  const { bookAppointment } = await import("../src/lib/appointments/book");
  const { findOrCreateClient } = await import("../src/lib/appointments/clients");
  const { wallTimeToUtc } = await import("../src/lib/dates");

  console.log("\nLa cuenta");
  check("however it is typed", normalizeCode("  verano 20 "), "VERANO20");
  check("20% of $900 is $180", discountFor(90_000, 20), 18_000);
  check("rounded to whole pesos", discountFor(99_900, 15), 15_000);
  check("never more than the price", discountFor(50_000, 100), 50_000);

  const TZ = "America/Montevideo";
  const now = wallTimeToUtc("2026-10-16", "12:00", TZ);
  const day = 86_400_000;

  await db.studio.deleteMany({ where: { slug: SLUG } });
  const studio = await db.studio.create({
    data: { name: "Cupones Verify", slug: SLUG, brand: "beauty", vertical: "APPOINTMENTS", minNoticeMinutes: 60, slotStepMinutes: 60 },
  });
  try {
    const ana = await db.user.create({ data: { studioId: studio.id, email: "ana@coupons.test", name: "Ana", role: "OWNER" } });
    await db.workingHours.create({ data: { studioId: studio.id, staffId: ana.id, weekday: 1, startMin: 540, endMin: 1080 } });
    const nails = await db.service.create({
      data: { studioId: studio.id, name: "Semipermanente", durationMin: 60, priceCents: 90_000, depositType: "PERCENT", depositValue: 50 },
    });
    const lashes = await db.service.create({ data: { studioId: studio.id, name: "Lifting", durationMin: 60, priceCents: 150_000 } });
    const pack = await db.classPack.create({ data: { studioId: studio.id, name: "8 clases", credits: 8, priceCents: 200_000, validityDays: 30 } });

    await db.coupon.createMany({
      data: [
        { studioId: studio.id, code: "VERANO20", percentOff: 20 },
        { studioId: studio.id, code: "UNAS10", percentOff: 10, serviceIds: [nails.id] },
        { studioId: studio.id, code: "VIEJO", percentOff: 30, validUntil: new Date(now.getTime() - day) },
        { studioId: studio.id, code: "PRONTO", percentOff: 30, validFrom: new Date(now.getTime() + day) },
        { studioId: studio.id, code: "PAUSADO", percentOff: 30, isActive: false },
        { studioId: studio.id, code: "PACK15", percentOff: 15, packIds: [pack.id] },
      ],
    });

    console.log("\nCuándo vale");
    const why = async (code: string, target: { serviceId?: string; packId?: string }) => {
      const r = await checkCoupon(studio.id, code, target, now);
      return "coupon" in r ? r.coupon.percentOff : r.problem;
    };
    check("typed in small letters", await why("verano20", { serviceId: lashes.id }), 20);
    check("one that does not exist", await why("NOEXISTE", { serviceId: nails.id }), "notFound");
    check("only for the service it was made for", [await why("UNAS10", { serviceId: nails.id }), await why("UNAS10", { serviceId: lashes.id })], [10, "notForThis"]);
    check("past its last day", await why("VIEJO", { serviceId: nails.id }), "expired");
    check("before its first day", await why("PRONTO", { serviceId: nails.id }), "notYet");
    check("paused", await why("PAUSADO", { serviceId: nails.id }), "notFound");
    check("for a pack: only that pack", [await why("PACK15", { packId: pack.id }), await why("PACK15", { packId: "otro" })], [15, "notForThis"]);
    check("a code is the business's own", (await checkCoupon("another-studio", "VERANO20", { serviceId: nails.id }, now)) && "problem", "problem");

    console.log("\nReservar con cupón");
    const { profile } = await findOrCreateClient(studio.id, { name: "Lucía", phone: "099 777 888" });
    const booked = await bookAppointment({
      studio,
      clientId: profile.id,
      serviceId: nails.id,
      staffId: ana.id,
      coupon: { code: "VERANO20", percentOff: 20 },
      startsAt: wallTimeToUtc("2026-10-19", "10:00", TZ),
      source: "CLIENT_PUBLIC",
      collectDeposit: true,
      now,
    });
    const appt = booked.ok ? await db.appointment.findUniqueOrThrow({ where: { id: booked.appointmentId } }) : null;
    check("price after the discount, with the code kept", [appt?.priceCents, appt?.discountCents, appt?.couponCode], [72_000, 18_000, "VERANO20"]);
    check("the deposit is half of what she pays, not of the list price", appt?.depositCents, 36_000);
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
