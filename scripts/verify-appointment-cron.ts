/**
 * The appointment jobs in the 15-minute sweep.
 * Run with: npx tsx scripts/verify-appointment-cron.ts
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never;

// Keep the dev email echo out of the output.
const info = console.info;
console.info = () => {};

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
  const { expireHolds, sendAppointmentReminders, sendRebookNudges } = await import("../src/lib/appointments/cron");
  const { wallTimeToUtc } = await import("../src/lib/dates");
  const TZ = "America/Montevideo";
  const DAY = 86_400_000;

  await db.studio.deleteMany({ where: { slug: "verify-appt-cron" } });
  const studio = await db.studio.create({
    data: { name: "Cron Verify", slug: "verify-appt-cron", vertical: "APPOINTMENTS", brand: "beauty", reminderHoursBefore: 24 },
  });
  const pro = await db.user.create({ data: { studioId: studio.id, email: "pro@c.test", name: "Pro", role: "OWNER" } });
  const service = await db.service.create({
    data: { studioId: studio.id, name: "Uñas", durationMin: 60, priceCents: 100000, rebookAfterDays: 21 },
  });
  const mkClient = async (name: string, email: string | null) =>
    (
      await db.user.create({
        data: { studioId: studio.id, name, email, phone: "099123456", role: "STUDENT", studentProfile: { create: {} } },
        include: { studentProfile: true },
      })
    ).studentProfile!;
  const ana = await mkClient("Ana", "ana@c.test");
  const bea = await mkClient("Bea", null);

  const now = wallTimeToUtc("2026-10-16", "12:00", TZ);
  let n = 0;
  const appt = (clientId: string, startsAt: Date, data: Record<string, unknown> = {}) =>
    db.appointment.create({
      data: {
        studioId: studio.id,
        staffId: pro.id,
        clientId,
        serviceId: service.id,
        serviceName: service.name,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 3_600_000),
        blockedUntil: new Date(startsAt.getTime() + 3_600_000),
        priceCents: 100000,
        manageTokenHash: `h-${n++}-${Date.now()}`,
        ...data,
      },
    });
  const logs = (template: string) => db.notificationLog.count({ where: { studioId: studio.id, template } });

  console.log("\nHolds");
  const stale = await appt(ana.id, new Date(now.getTime() + 3 * DAY), {
    status: "PENDING_PAYMENT",
    depositCents: 30000,
    depositStatus: "PENDING",
    holdExpiresAt: new Date(now.getTime() - 60_000),
  });
  const fresh = await appt(bea.id, new Date(now.getTime() + 4 * DAY), {
    status: "PENDING_PAYMENT",
    depositCents: 30000,
    depositStatus: "PENDING",
    holdExpiresAt: new Date(now.getTime() + 600_000),
  });
  check("one hold ran out", await expireHolds(studio, now), 1);
  check("it is expired", (await db.appointment.findUniqueOrThrow({ where: { id: stale.id } })).status, "EXPIRED");
  check("the other still holds", (await db.appointment.findUniqueOrThrow({ where: { id: fresh.id } })).status, "PENDING_PAYMENT");
  check("the client with an email is told", await logs("appointment_expired"), 1);

  console.log("\nReminders");
  const tomorrow = await appt(ana.id, new Date(now.getTime() + 20 * 3_600_000));
  await appt(ana.id, new Date(now.getTime() + 30 * 3_600_000));
  check("only what falls inside the 24 hours is reminded", await sendAppointmentReminders(studio, now), 1);
  check("and only once", await sendAppointmentReminders(studio, now), 0);
  check("it is stamped", Boolean((await db.appointment.findUniqueOrThrow({ where: { id: tomorrow.id } })).remindersSentAt), true);

  console.log("\nTe toca volver");
  await db.appointment.deleteMany({ where: { studioId: studio.id } });
  // Ana came 22 days ago: due. Bea came 22 days ago but has booked again.
  await appt(ana.id, new Date(now.getTime() - 22 * DAY), { status: "COMPLETED" });
  await appt(bea.id, new Date(now.getTime() - 22 * DAY), { status: "COMPLETED" });
  await appt(bea.id, new Date(now.getTime() + 2 * DAY));
  // Someone from long ago is not dug up.
  const old = await mkClient("Carla", "carla@c.test");
  await appt(old.id, new Date(now.getTime() - 90 * DAY), { status: "COMPLETED" });
  // Recent visit: not due yet.
  const dani = await mkClient("Dani", "dani@c.test");
  await appt(dani.id, new Date(now.getTime() - 5 * DAY), { status: "COMPLETED" });

  check("only Ana is due and has not rebooked", await sendRebookNudges(studio, now), 1);
  check("she gets an email", await logs("appointment_rebook"), 1);
  check("the owner gets the list", await logs("appointment_rebook_digest"), 1);
  check("nobody is nudged twice", await sendRebookNudges(studio, now), 0);
  check(
    "Dani is nudged once her 21 days come round",
    await sendRebookNudges(studio, new Date(now.getTime() + 17 * DAY)),
    1,
  );

  await db.studio.delete({ where: { id: studio.id } });
  console.info = info;
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
