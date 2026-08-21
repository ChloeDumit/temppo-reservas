/**
 * Measures the work each screen does per page view.
 * Run with: npx tsx scripts/bench.ts
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const req = createRequire(import.meta.url);
const so = req.resolve("server-only");
req.cache[so] = { id: so, filename: so, loaded: true, exports: {} } as never;

/*
  Only timings are reported. Counting queries here would need the client the
  library code itself holds; a second client, as this one is, sees none of them.
*/
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const { ensureInstances } = await import("../src/lib/classes");
  const studio = await db.studio.findUniqueOrThrow({ where: { slug: "soco" } });

  const time = async (label: string, fn: () => Promise<unknown>) => {
    const t0 = performance.now();
    await fn();
    const ms = performance.now() - t0;
    console.log(`  ${label.padEnd(34)} ${ms.toFixed(0).padStart(5)}ms`);
  };

  console.log("\nSOCO — 21 recurring classes\n");

  // Cold: the horizon is empty, so it generates everything.
  await db.classInstance.deleteMany({ where: { studioId: studio.id } });
  await db.studio.update({ where: { id: studio.id }, data: { instancesSyncedAt: null } });
  const cold = await db.studio.findUniqueOrThrow({ where: { id: studio.id } });
  await time("first ever run", () => ensureInstances(cold));

  // Warm: the common case — every page view of four different screens.
  const warm = await db.studio.findUniqueOrThrow({ where: { id: studio.id } });
  await time("page view, calendar already current", () => ensureInstances(warm));
  await time("page view again", () => ensureInstances(warm));

  // What a template change costs, which must not be skipped.
  await time("after saving a class (forced)", () =>
    ensureInstances(warm, new Date(), { force: true }));

  const count = await db.classInstance.count({ where: { studioId: studio.id } });
  console.log(`\n  ${count} occurrences in the horizon`);

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
