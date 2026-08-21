/**
 * Guided tour completeness.
 * Run with: npx tsx scripts/verify-tour.ts
 *
 * A tour step whose target is missing does not error — it quietly renders a
 * centred card pointing at nothing, and a step that promises to take you
 * somewhere that no longer exists is a dead end. These checks make both loud.
 */
import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";

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
const actions = readFileSync("src/app/[locale]/(app)/tour-actions.ts", "utf8");
const nav = readFileSync("src/components/app/nav-items.ts", "utf8");
const es = JSON.parse(readFileSync("src/messages/es.json", "utf8"));
const en = JSON.parse(readFileSync("src/messages/en.json", "utf8"));

type ParsedStep = {
  key: string | null;
  phase: string | null;
  target: string | null;
  href: string | null;
  needs: string | null;
};

function steps(name: string): ParsedStep[] {
  const start = tour.indexOf(`const ${name}: Step[] = [`);
  if (start < 0) throw new Error(`${name} not found — the tour was restructured`);
  const block = tour.slice(start, tour.indexOf("];", start));
  return [...block.matchAll(/\{([^}]*)\}/g)].map((m) => {
    const body = m[1];
    const field = (name: string) => body.match(new RegExp(`${name}: "([^"]+)"`))?.[1] ?? null;
    return {
      key: field("key"),
      phase: field("phase"),
      target: field("target"),
      href: field("href"),
      needs: field("needs"),
    };
  });
}

function navHrefs(constName: string) {
  const start = nav.indexOf(`const ${constName}`);
  const block = nav.slice(start, nav.indexOf("];", start));
  return [...block.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
}

const TAB_SLOTS = Number(nav.match(/TAB_SLOTS = (\d+)/)?.[1] ?? 4);

const setupSteps = steps("SETUP_STEPS");
const dailySteps = steps("DAILY_STEPS");
const staffSteps = [...setupSteps, ...dailySteps];
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

const routes = readdirSync("src/app/[locale]/(app)", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `/${entry.name}`);

/*
  An href may carry an anchor — several setup steps live in different sections
  of Ajustes — so the route is what gets checked, and the anchor separately.
*/
const deadEnds = staffSteps
  .filter((s) => s.href && !routes.includes(s.href.split("#")[0]))
  .map((s) => s.href);
check("every 'take me there' goes somewhere real", deadEnds, []);

// An anchor that names no element scrolls nowhere, which is the bug this
// replaced: the step pointed at the page it was already on and did nothing.
const anchors = staffSteps
  .map((s) => s.href?.split("#")[1])
  .filter((a): a is string => Boolean(a));

const settingsSource = readFileSync("src/app/[locale]/(app)/settings/page.tsx", "utf8");
check(
  "every anchored step has a section to scroll to",
  anchors.filter((a) => !settingsSource.includes(`id="${a}"`)),
  [],
);

check(
  "no step key is used twice",
  staffSteps.map((s) => s.key).filter((k, i, all) => all.indexOf(k) !== i),
  [],
);

console.log("\nEvery step has copy, in both languages");

for (const [label, list] of [
  ["staff", staffSteps],
  ["student", studentSteps],
] as const) {
  for (const [lang, messages] of [
    ["Spanish", es],
    ["English", en],
  ] as const) {
    const missing = list
      .filter((s) => !messages.tour[s.key!]?.title || !messages.tour[s.key!]?.body)
      .map((s) => s.key);
    check(`${label}: ${lang} copy complete`, missing, []);

    // A button with no label is a button nobody presses.
    const missingAction = list
      .filter((s) => s.href && !messages.tour[s.key!]?.action)
      .map((s) => s.key);
    check(`${label}: ${lang} action labels complete`, missingAction, []);
  }
}

console.log("\nSetup covers what a studio has to build");

/*
  The counts the setup steps tick themselves off against. Read from the action
  itself, so renaming one there and not here fails loudly instead of leaving a
  step permanently stuck on "pending".
*/
const returnStart = actions.indexOf("return {");
const progressKeys = actions
  .slice(returnStart + "return {".length, actions.indexOf("}", returnStart))
  .split(",")
  .map((part) => part.trim())
  .filter(Boolean);

const needed = setupSteps.map((s) => s.needs).filter(Boolean);
check(
  "every step that checks itself checks a real count",
  needed.filter((n) => !progressKeys.includes(n!)),
  [],
);
check(
  "every count the app can measure is used by a step",
  progressKeys.filter((k) => !needed.includes(k)),
  [],
);
check(
  "a step that can be ticked off can also be reached",
  setupSteps.filter((s) => s.needs && !s.href).map((s) => s.key),
  [],
);

/*
  Order matters more than coverage here. A class is assigned to a teacher and a
  standing spot needs both a class and a student, so a tour that introduced them
  the other way round would walk someone into an empty dropdown.
*/
const at = (key: string) => setupSteps.findIndex((s) => s.key === key);
check("teachers come before classes", at("teachers") < at("classes"), true);
check("classes come before fixed spots", at("classes") < at("spots"), true);
check("students come before fixed spots", at("students") < at("spots"), true);
check("the studio itself comes first", at("studio") < at("teachers"), true);

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

console.log("\nShape");

/*
  Deliberately long: it builds a studio from nothing. What keeps that bearable
  is that it is broken into two named halves and can be left and resumed, so
  the checks here are on the structure rather than on the step count.
*/
check("setup and daily are both substantial", [setupSteps.length >= 8, dailySteps.length >= 5], [
  true,
  true,
]);
check(
  "every step declares which half it belongs to",
  staffSteps.filter((s) => s.phase !== "setup" && s.phase !== "daily").map((s) => s.key),
  [],
);
check("student tour stays short", studentSteps.length <= 8, true);
check("the tour opens with a centred card", staffSteps[0].target, null);
check("and closes with one", staffSteps.at(-1)!.target, null);
check("it can be left and picked up again", /PLACE_KEY/.test(tour), true);
check("the last step says how to replay", /Más|More menu/.test(es.tour.done?.body ?? ""), true);

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exitCode = 1;
