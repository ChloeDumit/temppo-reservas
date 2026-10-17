/**
 * Which brand a host gets, and what an appointment studio starts with.
 * Run with: npx tsx scripts/verify-brand.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// The registry reads these at import time, so set them before loading it.
process.env.NEXT_PUBLIC_BEAUTY_DOMAINS = "agenda.example.uy, belleza.example.com";
process.env.NEXT_PUBLIC_BEAUTY_BRAND_NAME = "Agenda Prueba";
process.env.NEXT_PUBLIC_TEMPPO_DOMAINS = "reservas.temppo.uy";
process.env.EMAIL_FROM = "TEMPPO Reservas <no-reply@reservas.temppo.uy>";
delete process.env.BEAUTY_EMAIL_FROM;

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
  const { brandForHost, brandByKey } = await import("../src/lib/brand/registry");
  const { seedAppointmentStudio } = await import("../src/lib/appointments/seed");

  console.log("\nHost → brand");
  check("the TEMPPO domain is TEMPPO", brandForHost("reservas.temppo.uy").key, "temppo");
  check("the beauty domain is beauty", brandForHost("agenda.example.uy").key, "beauty");
  check("a port does not get in the way", brandForHost("agenda.example.uy:443").key, "beauty");
  check("case does not matter", brandForHost("Belleza.Example.com").key, "beauty");
  check("a subdomain of a brand domain belongs to it", brandForHost("www.belleza.example.com").key, "beauty");
  check("an unknown host falls back to TEMPPO", brandForHost("localhost:3000").key, "temppo");
  check("no host at all falls back to TEMPPO", brandForHost(null).key, "temppo");
  check("a look-alike is not a match", brandForHost("notagenda.example.uy").key, "temppo");
  check("the beauty brand sells appointments", brandForHost("agenda.example.uy").vertical, "APPOINTMENTS");
  check("the name comes from the environment", brandByKey("beauty").name, "Agenda Prueba");
  check("a studio from before brands is TEMPPO", brandByKey(null).key, "temppo");
  check(
    "beauty emails keep the verified address but sign with their own name",
    brandByKey("beauty").emailFrom,
    "Agenda Prueba <no-reply@reservas.temppo.uy>",
  );
  check("garbage in the column is TEMPPO", brandByKey("nope").key, "temppo");

  console.log("\nA new appointment business");
  await db.studio.deleteMany({ where: { slug: "verify-brand" } });
  const studio = await db.studio.create({
    data: { name: "Uñas Verify", slug: "verify-brand", brand: "beauty", vertical: "APPOINTMENTS" },
  });
  const owner = await db.user.create({
    data: { studioId: studio.id, email: "owner@verify-brand.test", name: "Dueña", role: "OWNER" },
  });
  await db.$transaction((tx) => seedAppointmentStudio(tx, studio.id, owner.id));

  const hours = await db.workingHours.findMany({ where: { staffId: owner.id }, orderBy: { weekday: "asc" } });
  check("she works Monday to Saturday", hours.map((h) => h.weekday), [1, 2, 3, 4, 5, 6]);
  check("from nine to seven", [hours[0].startMin, hours[0].endMin], [540, 1140]);
  check("there is a category to file services under", await db.serviceCategory.count({ where: { studioId: studio.id } }), 1);

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
