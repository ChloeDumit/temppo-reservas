/**
 * Captures the stills for a court-booking promo.
 *
 *   npm run padel:video
 *
 * Drives the real app in a phone-sized browser, so the footage is the product
 * rather than a mockup. Shoots the club's side and the player's side, because
 * the thing worth advertising is that the two meet without a phone call.
 *
 * Expects a build running on PORT (default 8899) and the club seeded:
 *   npm run seed:padel
 */
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const BASE = `http://localhost:${process.env.PORT || 8899}`;
const OUT = "demo";
const STILLS = join(OUT, "padel-stills");

// iPhone 14 Pro logical size, shot at 3× for a crisp 1170×2532 master.
const WIDTH = 390;
const HEIGHT = 844;
const SCALE = 3;

rmSync(STILLS, { recursive: true, force: true });
mkdirSync(STILLS, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: SCALE,
  locale: "es-UY",
  timezoneId: "America/Montevideo",
});

/*
  Registered before any page exists: an init script added afterwards does not
  apply to the page already open, which leaves first-run overlays sitting on
  top of the shot.
*/
await context.addInitScript(() => {
  localStorage.setItem("temppo:tour-seen", "1");
  localStorage.setItem("temppo:install-dismissed", "1");
});

const page = await context.newPage();
const beat = (ms = 1200) => page.waitForTimeout(ms);

let currentStep = "start";
process.on("uncaughtException", (e) => {
  console.error(`\nFailed during: ${currentStep}\n`, e.message);
  process.exit(1);
});

async function shot(name) {
  currentStep = name;
  await page.screenshot({ path: join(STILLS, `${name}.png`) });
  console.log(`  · ${name}`);
}

/** Scrolls by hand so the capture reads as a person using the app. */
async function glide(distance, steps = 20) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, distance / steps);
    await page.waitForTimeout(16);
  }
}

/*
  The option steps draw their choices as list rows; only the time step uses a
  grid. Scoping to the list keeps the back arrow and the trail chips — which
  are also buttons inside the section — out of the way.
*/
async function pick(text) {
  currentStep = `pick ${text}`;
  await page.locator("section li button", { hasText: text }).first().click();
  await beat(900);
}

async function pickRow(index) {
  currentStep = `row ${index}`;
  await page.locator("section li button").nth(index).click();
  await beat(900);
}

console.log("Shooting…");

// ── The player, booking from Instagram ──────────────────────────
await page.goto(`${BASE}/es/r/club-del-este`, { waitUntil: "networkidle" });
await beat(1600);
await shot("01-what");

await pick("Pádel");
await shot("02-duration");

await pick("1 h 30");
await beat(1400);
await shot("03-day");

// The second day, so the shot is not dominated by "Hoy".
await pickRow(1);
await beat(1200);
await shot("04-time");

// An evening slot: the one that carries the peak price.
const slots = page.locator("section .grid button");
const count = await slots.count();
await slots.nth(Math.min(20, count - 1)).click();
await beat(1200);
await shot("05-confirm");

await page.fill('input[autocomplete="name"]', "Joaquín Ferrés");
await page.fill('input[autocomplete="tel"]', "099 456 789");
await beat(900);
await shot("06-details");

// Take it, so the club screens show this booking landing.
currentStep = "confirm";
// The confirm button is the last one on the step, and its label changes with
// whether the club asks for a seña — so it is taken by position, not by text.
await page.locator("section button").last().click();
await page.waitForTimeout(2500);
await shot("07-booked");

// ── The club, seeing it land ────────────────────────────────────
currentStep = "sign in";
await page.goto(`${BASE}/es/login`, { waitUntil: "networkidle" });
await page.fill('input[name="identifier"]', "dueno@clubdeleste.uy");
await page.fill('input[name="secret"]', "padel1234");
await beat(500);
await page.click('button[type="submit"]');
await page.waitForLoadState("networkidle");
await beat(1800);
await shot("08-dashboard");

await page.goto(`${BASE}/es/rentals`, { waitUntil: "networkidle" });
await beat(1800);
await shot("09-agenda");
await glide(620);
await beat(1200);
await shot("10-agenda-evening");

await page.goto(`${BASE}/es/spaces`, { waitUntil: "networkidle" });
await beat(1700);
await shot("11-courts");

await browser.close();
console.log(`\nStills in ${STILLS}. Now: npm run padel:encode`);
