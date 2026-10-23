/**
 * A clean Temppo Beauty studio for the product videos: "Lu Nails Studio",
 * two professionals, real-looking services and clients, and appointments
 * around today. Re-running it rebuilds the studio from scratch.
 *
 *   npx tsx marketing/video/seed-demo.ts
 *
 * Signs in as demo@temppobeauty.test with DEMO_VIDEO_PASSWORD from .env.demo.local.
 */
import "dotenv/config";
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { wallTimeToUtc } from "../../src/lib/dates";

config({ path: ".env.demo.local" });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const TZ = "America/Montevideo";
const SLUG = "lu-nails-studio";
const DAY = 86_400_000;
const keyOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);

async function main() {
  const password = process.env.DEMO_VIDEO_PASSWORD;
  if (!password) throw new Error("Set DEMO_VIDEO_PASSWORD in .env.demo.local");

  await db.studio.deleteMany({ where: { slug: SLUG } });
  const studio = await db.studio.create({
    data: {
      name: "Lu Nails Studio",
      slug: SLUG,
      brand: "beauty",
      vertical: "APPOINTMENTS",
      accentColor: "#B5536F",
      whatsappNumber: "+59899000000",
      cancellationCutoffHours: 24,
      minNoticeMinutes: 60,
      slotStepMinutes: 30,
      holdMinutes: 30,
      bookingOpensDaysAhead: 30,
      onboardingCompletedAt: new Date(),
      locations: { create: { name: "Atlántida" } },
    },
  });
  const passwordHash = await bcrypt.hash(password, 10);
  const lu = await db.user.create({
    data: { studioId: studio.id, email: "demo@temppobeauty.test", name: "Lucía Pereira", role: "OWNER", passwordHash, emailVerified: new Date(), tourSeenAt: new Date() },
  });
  const sofi = await db.user.create({
    data: { studioId: studio.id, email: "sofi@temppobeauty.test", name: "Sofi", role: "INSTRUCTOR" },
  });
  for (const [pro, days, start, end] of [
    [lu, [1, 2, 3, 4, 5, 6], 9 * 60, 19 * 60],
    [sofi, [2, 3, 4, 5, 6], 10 * 60, 18 * 60],
  ] as const) {
    await db.workingHours.createMany({ data: days.map((weekday) => ({ studioId: studio.id, staffId: pro.id, weekday, startMin: start, endMin: end })) });
  }

  const [nails, lashes] = await Promise.all([
    db.serviceCategory.create({ data: { studioId: studio.id, name: "Uñas", position: 0 } }),
    db.serviceCategory.create({ data: { studioId: studio.id, name: "Pestañas y cejas", position: 1 } }),
  ]);
  const svc = async (data: Record<string, unknown>) => db.service.create({ data: { studioId: studio.id, ...data } as never });
  const semi = await svc({ categoryId: nails.id, name: "Semipermanente", description: "Esmaltado que dura 3 semanas.", durationMin: 60, priceCents: 120000, depositType: "PERCENT", depositValue: 30, bufferAfterMin: 15, rebookAfterDays: 21, position: 0 });
  const kapping = await svc({ categoryId: nails.id, name: "Kapping", description: "Refuerzo sobre la uña natural.", durationMin: 90, priceCents: 150000, depositType: "FIXED", depositValue: 40000, bufferAfterMin: 15, rebookAfterDays: 21, position: 1 });
  const esculpidas = await svc({ categoryId: nails.id, name: "Uñas esculpidas", durationMin: 120, priceCents: 190000, depositType: "FIXED", depositValue: 50000, bufferAfterMin: 15, rebookAfterDays: 21, position: 2 });
  const lifting = await svc({ categoryId: lashes.id, name: "Lifting de pestañas", durationMin: 60, priceCents: 180000, depositType: "PERCENT", depositValue: 30, rebookAfterDays: 42, position: 3 });
  const cejas = await svc({ categoryId: lashes.id, name: "Laminado de cejas", durationMin: 45, priceCents: 140000, depositType: "NONE", depositValue: 0, rebookAfterDays: 35, position: 4 });
  await db.serviceStaff.createMany({ data: [lifting.id, cejas.id].map((serviceId) => ({ serviceId, staffId: sofi.id })) });
  await db.serviceStaff.createMany({ data: [semi.id, kapping.id, esculpidas.id].flatMap((serviceId) => [{ serviceId, staffId: lu.id }, { serviceId, staffId: sofi.id }]) });
  await db.addOn.createMany({
    data: [
      { studioId: studio.id, serviceId: null, name: "Nail art", durationMin: 30, priceCents: 30000 },
      { studioId: studio.id, serviceId: null, name: "Retiro de esmaltado anterior", durationMin: 15, priceCents: 20000 },
    ],
  });

  const names = [
    ["Martina Rodríguez", "Látex"], ["Valentina Gómez", null], ["Camila Fernández", null], ["Sofía Pérez", null],
    ["Florencia Silva", "Adhesivo de pestañas"], ["Agustina López", null], ["Micaela Suárez", null], ["Lucía Méndez", null],
    ["Victoria Castro", null], ["Josefina Núñez", null], ["Catalina Ríos", null], ["Emilia Duarte", null],
    // Came weeks ago and have nothing booked: the "time to come back" list.
    ["Paula Benítez", null], ["Rocío Acosta", null], ["Julieta Moreira", "Acetona"],
  ] as const;
  const clients = [];
  for (const [i, [name, allergies]] of names.entries()) {
    const u = await db.user.create({
      data: {
        studioId: studio.id, name, role: "STUDENT", email: null,
        phone: `09${(1 + (i % 8))} ${String(100 + i * 37).slice(-3)} ${String(200 + i * 53).slice(-3)}`,
        studentProfile: { create: { allergies, notes: i === 0 ? "Forma almendra corta. Le gustan los nude y el francés." : i === 4 ? "Curvatura C, 0.07. Ojos sensibles." : i === 12 ? "Almendra mediana, tonos nude. Prefiere los sábados de mañana." : null, lastVisitAt: null } },
      },
      include: { studentProfile: true },
    });
    clients.push(u.studentProfile!);
  }

  const now = new Date();
  const today = keyOf(now);
  const at = (offset: number, time: string) => wallTimeToUtc(keyOf(new Date(now.getTime() + offset * DAY)), time, TZ);
  const services = { semi, kapping, esculpidas, lifting, cejas };
  type S = keyof typeof services;
  const plan: [number, string, number, "lu" | "sofi", S, string, string?][] = [
    // offset, time, client, pro, service, status, deposit
    [0, "09:00", 0, "lu", "semi", "COMPLETED", "PAID"],
    [0, "10:30", 1, "lu", "kapping", "CONFIRMED", "PAID"],
    [0, "11:00", 4, "sofi", "lifting", "CONFIRMED", "PAID"],
    [0, "13:00", 2, "lu", "esculpidas", "CONFIRMED", "PAID"],
    [0, "14:30", 3, "sofi", "cejas", "CONFIRMED"],
    [0, "16:00", 5, "lu", "semi", "PENDING_PAYMENT", "PENDING"],
    [0, "17:00", 6, "sofi", "semi", "CONFIRMED", "PAID"],
    [1, "09:30", 7, "lu", "semi", "CONFIRMED", "PAID"],
    [1, "11:00", 8, "sofi", "lifting", "CONFIRMED", "PAID"],
    [1, "15:00", 9, "lu", "kapping", "PENDING_PAYMENT", "PENDING"],
    [2, "10:00", 10, "lu", "esculpidas", "CONFIRMED", "PAID"],
    [2, "12:00", 11, "sofi", "cejas", "CONFIRMED"],
    [3, "10:00", 0, "sofi", "semi", "CONFIRMED", "PAID"],
    [4, "14:00", 1, "lu", "semi", "CONFIRMED", "PAID"],
    [5, "11:00", 2, "lu", "kapping", "CONFIRMED", "PAID"],
    [6, "16:00", 3, "sofi", "lifting", "CONFIRMED", "PAID"],
    [8, "10:00", 4, "lu", "semi", "CONFIRMED", "PAID"],
    [11, "13:00", 5, "sofi", "cejas", "CONFIRMED"],
    [-2, "10:00", 6, "lu", "semi", "COMPLETED", "PAID"],
    [-5, "15:00", 7, "sofi", "lifting", "NO_SHOW", "FORFEITED"],
    [-22, "11:00", 12, "lu", "semi", "COMPLETED", "PAID"],
    [-23, "16:00", 13, "lu", "kapping", "COMPLETED", "PAID"],
    [-44, "10:00", 14, "sofi", "lifting", "COMPLETED", "PAID"],
    [-44 - 21, "10:00", 12, "lu", "semi", "COMPLETED", "PAID"],
  ];
  // Clients with something coming up are not "due back".
  const upcoming = new Set(plan.filter(([off, , , , , st]) => off >= 0 && st !== "COMPLETED").map(([, , c]) => c));
  for (const [off, time, c, pro, s, status, dep] of plan) {
    if (off < -10 && upcoming.has(c)) continue;
    const service = services[s];
    const startsAt = at(off, time);
    const endsAt = new Date(startsAt.getTime() + service.durationMin * 60_000);
    const depositCents = service.depositType === "PERCENT" ? Math.round((service.priceCents * service.depositValue) / 100) : service.depositType === "FIXED" ? service.depositValue : 0;
    const appt = await db.appointment.create({
      data: {
        studioId: studio.id, staffId: pro === "lu" ? lu.id : sofi.id, clientId: clients[c].id, serviceId: service.id, serviceName: service.name,
        startsAt, endsAt, blockedUntil: new Date(endsAt.getTime() + service.bufferAfterMin * 60_000),
        status: status as never, source: "CLIENT_PUBLIC", priceCents: service.priceCents,
        depositCents: dep ? depositCents : 0, depositStatus: (dep ?? "NONE") as never,
        holdExpiresAt: status === "PENDING_PAYMENT" ? new Date(now.getTime() + 5 * 3600_000) : null,
        manageTokenHash: randomBytes(16).toString("hex"),
      },
    });
    if (status === "PENDING_PAYMENT") {
      await db.payment.create({
        data: { studioId: studio.id, studentId: clients[c].id, appointmentId: appt.id, amountCents: depositCents, method: "BANK_TRANSFER", status: "PENDING", shortCode: `TP-${randomBytes(3).toString("hex").toUpperCase()}` },
      });
    }
    if (status === "COMPLETED") await db.studentProfile.update({ where: { id: clients[c].id }, data: { lastVisitAt: startsAt } });
  }
  // A lunch block so the agenda looks like a real day.
  await db.timeOff.create({ data: { studioId: studio.id, staffId: lu.id, startsAt: at(1, "13:00"), endsAt: at(1, "14:00"), reason: "Almuerzo" } });
  await db.transaction.create({ data: { studioId: studio.id, type: "INCOME", category: "Señas", amountCents: 1854000, occurredAt: now } });

  console.log(`Lu Nails Studio ready (${today}): /es/b/${SLUG}`);
}
main().finally(() => db.$disconnect());
