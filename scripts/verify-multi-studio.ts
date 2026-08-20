/**
 * Exercises per-studio identity: one person, one account per studio, and the
 * picker token that resolves a login matching more than one of them.
 * Run with: npx tsx scripts/verify-multi-studio.ts
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

function check(label: string, ok: boolean) {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}`);
  ok ? passed++ : failed++;
}

const EMAIL = "multi-studio-probe@test.local";
const SLUGS = ["probe-studio-a", "probe-studio-b"];

async function main() {
  const { createStudioChoice, resolveStudioChoice, consumeStudioChoice } = await import(
    "../src/lib/auth/studio-choice"
  );

  await db.studio.deleteMany({ where: { slug: { in: SLUGS } } });

  const a = await db.studio.create({ data: { name: "Probe A", slug: SLUGS[0] } });
  const b = await db.studio.create({ data: { name: "Probe B", slug: SLUGS[1] } });

  console.log("\nPer-studio identity");

  await db.user.create({
    data: {
      studioId: a.id,
      email: EMAIL,
      name: "Ana",
      role: "STUDENT",
      studentProfile: { create: {} },
    },
  });
  check("the address gets an account at studio A", true);

  let secondCreated = false;
  try {
    await db.user.create({
      data: {
        studioId: b.id,
        email: EMAIL,
        name: "Ana",
        role: "STUDENT",
        studentProfile: { create: {} },
      },
    });
    secondCreated = true;
  } catch {
    secondCreated = false;
  }
  check("the same address gets a second account at studio B", secondCreated);

  let blockedInSameStudio = false;
  try {
    await db.user.create({
      data: { studioId: a.id, email: EMAIL, name: "Duplicate", role: "STUDENT" },
    });
  } catch {
    blockedInSameStudio = true;
  }
  check("a duplicate inside one studio is still rejected", blockedInSameStudio);

  const accounts = await db.user.findMany({ where: { email: EMAIL, isActive: true } });
  check("login resolves both candidate accounts", accounts.length === 2);

  const profiles = await db.studentProfile.findMany({
    where: { userId: { in: accounts.map((u) => u.id) } },
  });
  check("each studio keeps its own student profile", profiles.length === 2);

  console.log("\nStudio picker token");

  const token = await createStudioChoice(accounts.map((u) => u.id));
  const resolved = await resolveStudioChoice(token);

  check("the token offers both studios", resolved?.users.length === 2);
  check(
    "the picker names the studios",
    resolved?.users
      .map((u) => u.studio.name)
      .sort()
      .join(",") === "Probe A,Probe B",
  );

  const outsider = await db.user.findFirst({ where: { email: { not: EMAIL } } });
  check(
    "the token cannot reach an unrelated account",
    Boolean(outsider) && !resolved!.users.some((u) => u.id === outsider!.id),
  );

  await consumeStudioChoice(resolved!.record.id);
  check("the token is single use", (await resolveStudioChoice(token)) === null);
  check("a forged token is rejected", (await resolveStudioChoice("not-a-real-token")) === null);

  await db.studio.deleteMany({ where: { id: { in: [a.id, b.id] } } });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  await db.$disconnect();
  process.exit(failed ? 1 : 0);
}

main();
