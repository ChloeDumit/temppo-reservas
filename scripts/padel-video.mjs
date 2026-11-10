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
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
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

let lastShot = null;

async function shot(name) {
  currentStep = name;
  lastShot = name;
  // `next dev` floats its own badge over the corner. Taken out rather than
  // styled away: the overlay lives in a shadow root and ignored the stylesheet.
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove());
  await page.screenshot({ path: join(STILLS, `${name}.png`) });
  console.log(`  · ${name}`);
}

/*
  Where the finger lands, in still pixels, recorded against the shot that was
  on screen when it happened. The edit draws a ring there — without it the
  film is a slideshow of screens, and what sells a booking page is watching
  somebody press it.
*/
const taps = {};

async function tap(locator) {
  const box = await locator.boundingBox();
  if (box && lastShot) {
    taps[lastShot] = {
      x: Math.round((box.x + box.width / 2) * SCALE),
      y: Math.round((box.y + box.height / 2) * SCALE),
    };
  }
  await locator.click();
  await beat(900);
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
  await tap(page.locator("section li button", { hasText: text }).first());
}

async function pickRow(index) {
  currentStep = `row ${index}`;
  await tap(page.locator("section li button").nth(index));
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
await tap(slots.nth(Math.min(20, count - 1)));
await beat(600);
await shot("05-confirm");

await page.fill('input[autocomplete="name"]', "Joaquín Ferrés");
await page.fill('input[autocomplete="tel"]', "099 456 789");
await beat(900);
await shot("06-details");

// Take it, so the club screens show this booking landing.
currentStep = "confirm";
// The confirm button is the last one on the step, and its label changes with
// whether the club asks for a seña — so it is taken by position, not by text.
await tap(page.locator("section button").last());
await page.waitForTimeout(2200);
await shot("07-booked");

/*
  The seña. The club asks for a share of the price, so confirming holds the
  court instead of taking it, and the screen says what is owed and until when.
  This is the half of the product a club actually pays for, so it is shot
  rather than described.
*/
currentStep = "sena";
const payLink = page.locator('a[href*="/m/"]').first();
if (await payLink.count()) {
  await tap(payLink);
  await page.waitForLoadState("networkidle");
  await beat(1800);
  await shot("12-sena-pay");

  const transfer = page.locator("button", { hasText: /transferencia/i }).first();
  if (await transfer.count()) {
    await tap(transfer);
    await beat(1600);
    await shot("13-sena-code");
  }
}

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

writeFileSync(join(STILLS, "taps.json"), JSON.stringify(taps, null, 2));

await browser.close();
console.log(`\nStills in ${STILLS}, ${Object.keys(taps).length} taps recorded.`);
console.log("Now: npm run padel:encode");
