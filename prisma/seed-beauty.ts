/**
 * Seeds a Temppo Beauty studio for trying the appointments product locally.
 *
 *   npm run seed:beauty
 *
 * Independent of the other seeds — re-running only resets Studio Lu. Open it
 * on the beauty brand: http://localhost:3000/es/login?brand=beauty
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const PASSWORD = "beauty1234";
const SLUG = "studio-lu";

// Weekdays follow JS getDay(): 0 = Sunday … 6 = Saturday.
const WEEK = [1, 2, 3, 4, 5].flatMap((weekday) => [
  { weekday, startMin: 9 * 60, endMin: 13 * 60 },
  { weekday, startMin: 14 * 60, endMin: 19 * 60 },
]).concat([{ weekday: 6, startMin: 9 * 60, endMin: 13 * 60 }]);

const SERVICES = [
  { name: "Esmaltado semipermanente", durationMin: 60, price: 900, deposit: 300, rebookAfterDays: 21 },
  { name: "Kapping gel", durationMin: 90, price: 1300, deposit: 400, rebookAfterDays: 21 },
  { name: "Lifting de pestañas", durationMin: 60, price: 1500, deposit: 500, rebookAfterDays: 42 },
  { name: "Perfilado de cejas", durationMin: 30, price: 600, deposit: 0, rebookAfterDays: 28 },
];

async function main() {
  console.log("Resetting Studio Lu…");
  await db.studio.deleteMany({ where: { slug: SLUG } });

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const studio = await db.studio.create({
    data: {
      name: "Studio Lu",
      slug: SLUG,
      brand: "beauty",
      vertical: "APPOINTMENTS",
      plan: "TRIAL",
      trialEndsAt: new Date(Date.now() + 30 * 86_400_000),
      whatsappNumber: "+59899123456",
      accentColor: "#B5566E",
      reminderHoursBefore: 24,
      locations: { create: { name: "Studio Lu" } },
    },
  });

  const owner = await db.user.create({
    data: { studioId: studio.id, email: "lu@studiolu.uy", name: "Lucía", role: "OWNER", passwordHash },
  });
  const sofi = await db.user.create({
    data: { studioId: studio.id, email: "sofi@studiolu.uy", name: "Sofía", role: "INSTRUCTOR", passwordHash },
  });
  for (const staff of [owner, sofi]) {
    await db.workingHours.createMany({ data: WEEK.map((h) => ({ studioId: studio.id, staffId: staff.id, ...h })) });
  }

  const category = await db.serviceCategory.create({ data: { studioId: studio.id, name: "Servicios", position: 0 } });
  for (const [position, s] of SERVICES.entries()) {
    const service = await db.service.create({
      data: {
        studioId: studio.id,
        categoryId: category.id,
        name: s.name,
        durationMin: s.durationMin,
        priceCents: s.price * 100,
        depositType: s.deposit ? "FIXED" : "NONE",
        depositValue: s.deposit * 100,
        rebookAfterDays: s.rebookAfterDays,
        position,
      },
    });
    await db.serviceStaff.createMany({
      data: [owner, sofi].map((staff) => ({ serviceId: service.id, staffId: staff.id })),
    });
  }

  for (const [name, phone] of [
    ["Ana Pérez", "099111222"],
    ["Camila Rodríguez", "098333444"],
    ["Valentina Gómez", "091555666"],
  ]) {
    await db.user.create({
      data: { studioId: studio.id, name, phone, role: "STUDENT", studentProfile: { create: {} } },
    });
  }

  console.log("\nStudio Lu is ready (Temppo Beauty).");
  console.log(`  Owner          lu@studiolu.uy / ${PASSWORD}`);
  console.log(`  Professional   sofi@studiolu.uy / ${PASSWORD}`);
  console.log("  Log in         http://localhost:3000/es/login?brand=beauty");
  console.log(`  Booking page   http://localhost:3000/es/b/${SLUG}?brand=beauty`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
