/**
 * The content plans the console can load.
 * Run with: npx tsx scripts/verify-content-plans.ts
 *
 * A plan is loaded once, matched by title, onto the brand it belongs to. A
 * duplicate title would silently skip a post; a wrong brand would put a
 * padel reel on the beauty account.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const req = createRequire(import.meta.url);
const so = req.resolve("server-only");
req.cache[so] = { id: so, filename: so, loaded: true, exports: {} } as never;

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
  const { CONTENT_PLANS } = await import("../src/lib/content/plan-noviembre");

  console.log("\nEvery plan belongs to a brand");

  check(
    "each one says which",
    CONTENT_PLANS.filter((p) => p.brand !== "beauty" && p.brand !== "temppo").map((p) => p.id),
    [],
  );
  check("both products have plans", [
    CONTENT_PLANS.some((p) => p.brand === "beauty"),
    CONTENT_PLANS.some((p) => p.brand === "temppo"),
  ], [true, true]);
  check(
    "no plan id is used twice",
    CONTENT_PLANS.map((p) => p.id).filter((id, i, all) => all.indexOf(id) !== i),
    [],
  );

  console.log("\nTitles are the key, so they have to be unique");

  // loadPlanAction skips a post whose title already exists on that brand.
  for (const brand of ["beauty", "temppo"] as const) {
    const titles = CONTENT_PLANS.filter((p) => p.brand === brand).flatMap((p) =>
      p.items.map((i) => i.title),
    );
    check(
      `${brand}: no repeated title`,
      titles.filter((t, i, all) => all.indexOf(t) !== i),
      [],
    );
  }

  console.log("\nEvery post is loadable as written");

  const items = CONTENT_PLANS.flatMap((p) => p.items);
  check("all have a caption", items.filter((i) => !i.caption.trim()).map((i) => i.title), []);
  check("all say which file to attach", items.filter((i) => !i.notes?.trim()).map((i) => i.title), []);
  check(
    "dates are real days",
    items
      .filter((i) => i.date !== null && Number.isNaN(new Date(`${i.date}T12:00:00Z`).getTime()))
      .map((i) => i.title),
    [],
  );
  check(
    "times are times",
    items.filter((i) => !/^\d{1,2}:\d{2}$/.test(i.time)).map((i) => i.title),
    [],
  );

  console.log("\nThe TEMPPO plan speaks to both audiences");

  const temppo = CONTENT_PLANS.filter((p) => p.brand === "temppo").flatMap((p) => p.items);
  const captions = temppo.map((i) => i.caption).join(" ");
  // One account, two kinds of buyer: a plan that only talks to one wastes half.
  check("it mentions courts", /cancha/i.test(captions), true);
  check("and classes", /clase/i.test(captions), true);
  check("and carries hashtags", /#\w+/.test(captions), true);
  check("with a reel among them", temppo.some((i) => i.kind === "REEL"), true);

  console.log("\nThe console loads them per brand");

  const actions = readFileSync("src/app/[locale]/(admin)/admin/content/actions.ts", "utf8");
  check("the post is created on the plan's brand", /brand: plan\.brand,/.test(actions), true);
  // The bug this replaces: every plan wrote onto beauty whatever it was for.
  check("and not on beauty regardless", /brand: "beauty",\n\s+title: item\.title,/.test(actions), false);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
