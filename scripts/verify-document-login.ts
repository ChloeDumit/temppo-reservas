/**
 * Exercises sign-in by cédula: optional emails, per-studio document handles,
 * and the PIN behind them.
 * Run with: npx tsx scripts/verify-document-login.ts
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

const SLUGS = ["doc-probe-a", "doc-probe-b"];

async function main() {
  const { normalizeDocumentId } = await import("../src/lib/auth/document");
  const { hashPassword, verifyPassword } = await import("../src/lib/auth/password");

  await db.studio.deleteMany({ where: { slug: { in: SLUGS } } });
  const a = await db.studio.create({ data: { name: "Doc A", slug: SLUGS[0] } });
  const b = await db.studio.create({ data: { name: "Doc B", slug: SLUGS[1] } });

  console.log("\nDocument normalisation");
  const canonical = normalizeDocumentId("1.234.567-8");
  check("dots and dashes are stripped", canonical === "12345678");
  check("a bare number is unchanged", normalizeDocumentId("12345678") === canonical);
  check("spacing does not matter", normalizeDocumentId(" 1234 5678 ") === canonical);

  console.log("\nAccounts without an email");
  const pinHash = await hashPassword("4821");

  const first = await db.user.create({
    data: {
      studioId: a.id,
      email: null,
      documentId: canonical,
      pinHash,
      name: "Elsa",
      role: "STUDENT",
      studentProfile: { create: {} },
    },
  });
  check("a student can exist with no email at all", first.email === null);

  // The per-studio unique index on email must tolerate repeated NULLs, or the
  // second email-less student in a studio would collide with the first.
  let secondNoEmail = false;
  try {
    await db.user.create({
      data: {
        studioId: a.id,
        email: null,
        documentId: "87654321",
        name: "Raúl",
        role: "STUDENT",
        studentProfile: { create: {} },
      },
    });
    secondNoEmail = true;
  } catch {
    secondNoEmail = false;
  }
  check("a second email-less student in the same studio is fine", secondNoEmail);

  console.log("\nDocument uniqueness");
  let acrossStudios = false;
  try {
    await db.user.create({
      data: {
        studioId: b.id,
        email: null,
        documentId: canonical,
        pinHash,
        name: "Elsa",
        role: "STUDENT",
        studentProfile: { create: {} },
      },
    });
    acrossStudios = true;
  } catch {
    acrossStudios = false;
  }
  check("the same cédula works at a second studio", acrossStudios);

  let sameStudioBlocked = false;
  try {
    await db.user.create({
      data: { studioId: a.id, documentId: canonical, name: "Impostor", role: "STUDENT" },
    });
  } catch {
    sameStudioBlocked = true;
  }
  check("the same cédula twice in one studio is rejected", sameStudioBlocked);

  console.log("\nPIN");
  const found = await db.user.findMany({ where: { documentId: canonical } });
  check("the cédula resolves both studios", found.length === 2);
  check("the right PIN verifies", await verifyPassword("4821", found[0].pinHash!));
  check("a wrong PIN does not", !(await verifyPassword("0000", found[0].pinHash!)));

  await db.studio.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  console.log(`\n${passed} passed, ${failed} failed\n`);
  await db.$disconnect();
  process.exit(failed ? 1 : 0);
}

main();
