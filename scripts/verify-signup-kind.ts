/**
 * What a business says it sells, at sign-up.
 * Run with: npx tsx scripts/verify-signup-kind.ts
 *
 * The domain used to decide this, so a padel club registering through the
 * courts landing became a class studio and landed in an app about pilates.
 * These checks pin down that the answer is now the studio's own.
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

const actions = readFileSync("src/app/[locale]/(auth)/actions.ts", "utf8");
const form = readFileSync("src/app/[locale]/(auth)/register/register-form.tsx", "utf8");
const page = readFileSync("src/app/[locale]/(auth)/register/page.tsx", "utf8");
const landing = readFileSync("src/app/[locale]/page.tsx", "utf8");
const es = JSON.parse(readFileSync("src/messages/es.json", "utf8"));
const en = JSON.parse(readFileSync("src/messages/en.json", "utf8"));

console.log("\nThe business is asked, not inferred");

check("the form offers the three kinds", /name="vertical"/.test(form), true);
check("sign-up accepts the answer", /vertical: z\.enum\(\["CLASSES", "VENUES", "APPOINTMENTS"\]\)/.test(actions), true);
// The bug this replaces: brand.vertical written straight onto the studio.
check("and no longer takes it from the domain alone", /vertical: brand\.vertical,/.test(actions), false);
check("falling back when nothing is chosen", /parsed\.data\.vertical \?\? "CLASSES"/.test(actions), true);

console.log("\nThe beauty brand keeps its own answer");

// Temppo Beauty is its own product at its own domain; asking there is noise.
check("the question is hidden on that brand", /\{!beauty && \(/.test(form), true);
check(
  "and the brand still decides for it",
  /brand\.key === "temppo" \? \(parsed\.data\.vertical \?\? "CLASSES"\) : brand\.vertical/.test(actions),
  true,
);

console.log("\nOne landing, every rubro");

// She asked for one product with the rubro chosen at sign-up, not a page per
// rubro — so the landing describes the three and the sign-up decides.
check("the landing names the three", /kind1Name[\s\S]*kind2Name[\s\S]*kind3Name/.test(landing), true);
check("and does not send anyone to a second page", landing.includes("/canchas"), false);
check("the sign-up still accepts a pre-answer", /canchas: "VENUES"/.test(page), true);

console.log("\nCopy, in both languages");

for (const [lang, m] of [["Spanish", es], ["English", en]] as const) {
  const missing = [
    "manageLabel", "manageHint", "kindClasses", "kindClassesHint",
    "kindVenues", "kindVenuesHint", "kindAppointments", "kindAppointmentsHint", "linkIncluded",
  ].filter((key) => !m.auth[key]);
  check(`${lang}: the question is written`, missing, []);
}

console.log("\nThe link is included, not sold apart");

check("the landing says so", Boolean(es.marketing.linkTitle), true);
check("in both languages", Boolean(en.marketing.linkTitle), true);
// The old split is gone for good.
check("no separate courts namespace survives", Boolean(es.venuesLanding), false);


console.log("\nPublished prices");

/*
  The landing quotes planPrices(), which the PlanPrice table overrides. A row
  left in that table once had the page publishing numbers nobody had agreed
  to — so the code constants are pinned here, and the console is the only
  place allowed to differ from them deliberately.
*/
const plans = readFileSync("src/lib/billing/plans.ts", "utf8");
const amount = (plan: string) =>
  Number(plans.match(new RegExp(`${plan}: ([\\d_]+),`))?.[1].replace(/_/g, "") ?? 0);

check("Esencial", amount("ESSENTIAL"), 99_000);
check("Estudio", amount("STUDIO"), 199_000);
check("Red", amount("NETWORK"), 349_000);
check("none of them is still a placeholder", /placeholder/i.test(plans), false);

const landingSource = readFileSync("src/app/[locale]/page.tsx", "utf8");
check("the page reads them rather than repeating them", landingSource.includes("planPrices()"), true);
check(
  "and says the limits in each rubro's own unit",
  ["limitClasses", "limitVenues", "limitAppointments"].every((k) => landingSource.includes(k)),
  true,
);

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exitCode = 1;
