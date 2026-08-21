/**
 * Guided tour completeness.
 * Run with: npx tsx scripts/verify-tour.ts
 *
 * A tour step whose target is missing does not error — it quietly renders a
 * centred card pointing at nothing. These checks make that loud instead.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";

let passed = 0;
let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(
    `${ok ? "  ok  " : " FAIL "} ${label}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`,
  );
  ok ? passed++ : failed++;
}

const tour = readFileSync("src/components/app/guided-tour.tsx", "utf8");
const nav = readFileSync("src/components/app/nav-items.ts", "utf8");
const es = JSON.parse(readFileSync("src/messages/es.json", "utf8"));
const en = JSON.parse(readFileSync("src/messages/en.json", "utf8"));

function steps(name: string) {
  const start = tour.indexOf(`const ${name}: Step[] = [`);
  const block = tour.slice(start, tour.indexOf("];", start));
  return [...block.matchAll(/key: "(\w+)"(?:,\s*target: "([^"]+)")?/g)].map((m) => ({
    key: m[1],
    target: m[2] ?? null,
  }));
}

function navHrefs(constName: string) {
  const start = nav.indexOf(`const ${constName}`);
  const block = nav.slice(start, nav.indexOf("];", start));
  return [...block.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
}

const TAB_SLOTS = Number(nav.match(/TAB_SLOTS = (\d+)/)?.[1] ?? 4);

const staffSteps = steps("STAFF_STEPS");
const studentSteps = steps("STUDENT_STEPS");
const staffNav = navHrefs("STAFF_NAV");
const studentNav = navHrefs("STUDENT_NAV");

/** What the tab bar actually renders for a role: N destinations plus "more". */
function tabTargets(hrefs: string[]) {
  return [...hrefs.slice(0, TAB_SLOTS).map((h) => `tab:${h}`), "tab:more"];
}

console.log("\nEvery step can be shown");

for (const [label, list, hrefs] of [
  ["staff", staffSteps, staffNav],
  ["student", studentSteps, studentNav],
] as const) {
  const available = tabTargets(hrefs);
  const broken = list.filter((s) => s.target && !available.includes(s.target)).map((s) => s.target);
  check(`${label}: every target is a real tab`, broken, []);
}

console.log("\nEvery step has copy, in both languages");

for (const [label, list] of [
  ["staff", staffSteps],
  ["student", studentSteps],
] as const) {
  const missingEs = list.filter((s) => !es.tour[s.key]?.title || !es.tour[s.key]?.body);
  const missingEn = list.filter((s) => !en.tour[s.key]?.title || !en.tour[s.key]?.body);
  check(`${label}: Spanish copy complete`, missingEs.map((s) => s.key), []);
  check(`${label}: English copy complete`, missingEn.map((s) => s.key), []);
}

console.log("\nCoverage");

// Every primary tab should be introduced; the rest are named inside "Más".
const staffPrimary = staffNav.slice(0, TAB_SLOTS).map((h) => `tab:${h}`);
const covered = staffSteps.map((s) => s.target).filter(Boolean);
check(
  "staff: every primary tab is introduced",
  staffPrimary.filter((t) => !covered.includes(t)),
  [],
);

const studentPrimary = studentNav.slice(0, TAB_SLOTS).map((h) => `tab:${h}`);
check(
  "student: every primary tab is introduced",
  studentPrimary.filter((t) => !covered.concat(studentSteps.map((s) => s.target)).includes(t)),
  [],
);

// The overflow sections are only discoverable if the "Más" step names them.
// Owner-only tabs are left out: the tour runs for every staff role, and naming
// a destination an ADMIN cannot see teaches them a door that isn't there.
const ownerOnly = [...nav.matchAll(/OWNER_ONLY = \[([^\]]*)\]/g)]
  .flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)])
  .map((m) => m[1]);

const moreBody = es.tour.more?.body ?? "";
const overflowLabels = staffNav
  .slice(TAB_SLOTS)
  .filter((h) => !ownerOnly.includes(h))
  .map((h) => h.replace("/", ""));
const namedInMore = ["Alumnos", "Clases", "Interesados", "Packs", "Pagos", "Reportes", "Ajustes"];
check("the Más step names what is inside", overflowLabels.length, namedInMore.length);
check(
  "and each of those words appears in the copy",
  namedInMore.filter((word) => !moreBody.includes(word)),
  [],
);

console.log("\nUsability");

check("staff tour stays short", staffSteps.length <= 8, true);
check("student tour stays short", studentSteps.length <= 8, true);
check("staff tour opens and closes with a centred card", [staffSteps[0].target, staffSteps.at(-1)!.target], [null, null]);
check("the last step says how to replay", /Más|More menu/.test(es.tour.done?.body ?? ""), true);

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exitCode = 1;
