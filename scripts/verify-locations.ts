/**
 * Exercises sucursal scoping: which classes, students and payments come back
 * once a location is selected, and how students attach to more than one.
 *
 * The cookie plumbing itself lives behind next/headers and is checked in the
 * browser; what matters here is that the queries the pages run scope correctly.
 * Run with: npx tsx scripts/verify-locations.ts
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as never;

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

const SLUG = "verify-locations";
const OTHER = "verify-locations-other";

async function main() {
  await db.studio.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });

  const studio = await db.studio.create({
    data: { name: "Two Sucursales", slug: SLUG, timezone: "America/Montevideo" },
  });
  const rival = await db.studio.create({
    data: { name: "Rival", slug: OTHER, timezone: "America/Montevideo" },
  });

  const centro = await db.location.create({ data: { studioId: studio.id, name: "Centro" } });
  const pocitos = await db.location.create({ data: { studioId: studio.id, name: "Pocitos" } });
  const rivalLocation = await db.location.create({ data: { studioId: rival.id, name: "Rival HQ" } });

  const mkStudent = async (email: string, locationIds: string[]) => {
    const user = await db.user.create({
      data: {
        studioId: studio.id,
        email,
        name: email,
        role: "STUDENT",
        studentProfile: {
          create: { locations: { connect: locationIds.map((id) => ({ id })) } },
        },
      },
      include: { studentProfile: true },
    });
    return user.studentProfile!;
  };

  const onlyCentro = await mkStudent("centro@verify.test", [centro.id]);
  const both = await mkStudent("both@verify.test", [centro.id, pocitos.id]);
  const unassigned = await mkStudent("nowhere@verify.test", []);

  const mkClass = (name: string, locationId: string) => {
    const startsAt = new Date(Date.now() + 24 * 3_600_000);
    return db.classInstance.create({
      data: {
        studioId: studio.id,
        locationId,
        name,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 3_600_000),
        capacity: 10,
        status: "SCHEDULED",
      },
    });
  };

  await mkClass("Centro Reformer", centro.id);
  await mkClass("Centro Mat", centro.id);
  await mkClass("Pocitos Reformer", pocitos.id);

  console.log("\nClasses by sucursal");
  const scoped = (locationId: string | null) =>
    db.classInstance.count({
      where: { studioId: studio.id, ...(locationId ? { locationId } : {}) },
    });

  check("no sucursal chosen shows all three", await scoped(null), 3);
  check("Centro shows its two", await scoped(centro.id), 2);
  check("Pocitos shows its one", await scoped(pocitos.id), 1);

  console.log("\nStudents by sucursal");
  const studentsAt = (locationId: string | null) =>
    db.studentProfile.count({
      where: {
        user: { studioId: studio.id },
        ...(locationId ? { locations: { some: { id: locationId } } } : {}),
      },
    });

  check("all three when nothing is chosen", await studentsAt(null), 3);
  check("Centro has two", await studentsAt(centro.id), 2);
  check("Pocitos has one", await studentsAt(pocitos.id), 1);

  const bothRow = await db.studentProfile.findUnique({
    where: { id: both.id },
    select: { locations: { select: { id: true } } },
  });
  check("a student can belong to two at once", bothRow?.locations.length, 2);

  console.log("\nReassigning");
  await db.studentProfile.update({
    where: { id: both.id },
    data: { locations: { set: [{ id: pocitos.id }] } },
  });
  check("setting the list detaches the old one", await studentsAt(centro.id), 1);

  const reassigned = await db.studentProfile.findUnique({
    where: { id: both.id },
    select: { locations: { select: { id: true } } },
  });
  check("the student is left with exactly one", reassigned?.locations.length, 1);
  check("and it is the new one", reassigned?.locations[0]?.id, pocitos.id);

  console.log("\nGuards");
  // What currentLocationId does before trusting a cookie.
  const foreign = await db.location.findFirst({
    where: { id: rivalLocation.id, studioId: studio.id },
  });
  check("another studio's sucursal never resolves", foreign, null);

  const own = await db.location.findFirst({ where: { id: centro.id, studioId: studio.id } });
  check("the studio's own does", own?.id, centro.id);

  check(
    "an unassigned student belongs to none",
    (
      await db.studentProfile.findUnique({
        where: { id: unassigned.id },
        select: { locations: true },
      })
    )?.locations.length,
    0,
  );
  check("but is still visible studio-wide", await studentsAt(null), 3);

  // Deleting a sucursal must not take its students with it.
  await db.location.delete({ where: { id: centro.id } });
  check("removing a sucursal leaves its students alone", await studentsAt(null), 3);
  check(
    "the student who was only at Centro survives",
    (await db.studentProfile.findUnique({ where: { id: onlyCentro.id } })) !== null,
    true,
  );

  await db.studio.deleteMany({ where: { id: { in: [studio.id, rival.id] } } });
  console.log(`\n${passed} passed, ${failed} failed\n`);
  await db.$disconnect();
  process.exit(failed ? 1 : 0);
}

main();
