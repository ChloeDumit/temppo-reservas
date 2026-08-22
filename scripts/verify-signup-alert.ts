/**
 * Who hears about a new studio.
 * Run with: npx tsx scripts/verify-signup-alert.ts
 *
 * A signup alert that goes nowhere fails silently — the studio registers, the
 * page redirects, and nobody finds out for a week. This pins down the
 * recipient list, and that registration still asks for it.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
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

async function main() {
  const { platformAdminRecipients } = await import("../src/lib/notifications");

  /*
    Real platform admins live in this database, and the console grants the flag
    to whoever runs TEMPPO. Asserting on an exact list would fail the moment a
    second person is given access, so every check below is about the fixtures
    this script created and cleans up.
  */
  const studio = await db.studio.create({
    data: { name: "Alertas", slug: `alert-${Date.now()}`, timezone: "America/Montevideo" },
  });

  const mk = (email: string, isPlatformAdmin: boolean, isActive = true) =>
    db.user.create({
      data: { studioId: studio.id, name: email, email, role: "OWNER", isPlatformAdmin, isActive },
    });

  const admin = await mk("admin@alert.test", true);
  const secondAdmin = await mk("second@alert.test", true);
  const retired = await mk("retired@alert.test", true, false);
  const owner = await mk("owner@alert.test", false);

  console.log("\nWho gets told");

  const opsBefore = process.env.OPS_EMAIL;
  delete process.env.OPS_EMAIL;

  const list = await platformAdminRecipients();

  check("a platform admin is on the list", list.includes(admin.email!), true);
  check("so is a second one", list.includes(secondAdmin.email!), true);
  // The point of the flag: running a studio is not running the platform.
  check("a studio owner is not", list.includes(owner.email!), false);
  check("nor is a deactivated admin", list.includes(retired.email!), false);
  check("nobody is told twice", list.length, new Set(list).size);

  console.log("\nThe ops inbox");

  process.env.OPS_EMAIL = "ops@alert.test";
  const withInbox = await platformAdminRecipients();
  check("OPS_EMAIL still works alongside the admins", withInbox.includes("ops@alert.test"), true);
  check("and the admins are kept", withInbox.includes(admin.email!), true);

  // Belt and braces: the same address in both places must not send twice.
  process.env.OPS_EMAIL = admin.email!;
  const overlapping = await platformAdminRecipients();
  check(
    "an admin who is also the ops inbox is listed once",
    overlapping.filter((email) => email === admin.email).length,
    1,
  );

  if (opsBefore === undefined) delete process.env.OPS_EMAIL;
  else process.env.OPS_EMAIL = opsBefore;

  console.log("\nRegistration asks for it");

  const source = readFileSync("src/app/[locale]/(auth)/actions.ts", "utf8");
  check("the signup calls it", source.includes("notifyPlatformAdmins("), true);
  // The old version only ever mailed an env var, and did nothing without one.
  check("and no longer mails OPS_EMAIL directly", source.includes("process.env.OPS_EMAIL"), false);
  check(
    "the alert links to the studio in the console",
    /admin\/studios\/\$\{user\.studioId\}/.test(source),
    true,
  );

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
