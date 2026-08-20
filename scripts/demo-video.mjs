/**
 * Records a product demo of TEMPPO Reservas.
 *
 *   npm run demo:video
 *
 * Drives the real app in a phone-sized browser and records it, so the footage
 * is the actual product rather than mockups. Output lands in demo/ as an MP4
 * ready to embed on the landing page, plus stills for social posts.
 *
 * Expects the production build running on PORT (default 8899) and the demo
 * data seeded: npm run seed && npm run scenario:waitlist
 */
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const BASE = `http://localhost:${process.env.PORT || 8899}`;
const OUT = "demo";
const RAW = join(OUT, "raw");

// iPhone 14 Pro logical size; recorded at 3× for a crisp 1170×2532 master.
const WIDTH = 390;
const HEIGHT = 844;
const SCALE = 3;

rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });
mkdirSync(join(OUT, "stills"), { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: SCALE,
  locale: "es-UY",
  timezoneId: "America/Montevideo",
});

/**
 * Suppress first-run overlays so the walkthrough is not interrupted.
 * Registered before the page exists: an init script added afterwards does not
 * apply to that page, which leaves the guided tour covering the tab bar.
 */
await context.addInitScript(() => {
  localStorage.setItem("temppo:tour-seen", "1");
  localStorage.setItem("temppo:install-dismissed", "1");
});

const page = await context.newPage();

const beat = (ms = 1400) => page.waitForTimeout(ms);

/** Scrolls smoothly so the recording reads as a person using the app. */
async function glide(distance, steps = 24) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, distance / steps);
    await page.waitForTimeout(16);
  }
}

let currentStep = "start";
function step(name) {
  currentStep = name;
  console.log(`  · ${name}`);
}

async function shot(name) {
  await page.screenshot({ path: join(OUT, "stills", `${name}.png`) });
  console.log(`  · ${name}`);
}

async function signIn(email) {
  await page.goto(`${BASE}/es/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "demo1234");
  await beat(500);
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle");
}

console.log("Recording…");
process.on("uncaughtException", (e) => {
  console.error(`\nFailed during: ${currentStep}\n`, e.message);
  process.exit(1);
});

// ── Studio owner ────────────────────────────────────────────────
await signIn("owner@anima.uy");
await beat(1800);
await shot("01-dashboard");
await glide(500);
await beat(900);

// The week's schedule
await page.click('[data-tour="tab:/schedule"]');
await page.waitForLoadState("networkidle");
await beat(1700);
await shot("02-schedule");
await glide(420);
await beat(1100);

// Standing weekly spots — the differentiator
await page.click('[data-tour="tab:/availability"]');
await page.waitForLoadState("networkidle");
await beat(1700);
await shot("03-standing-spots");

// Open one slot to reveal who holds it
const firstSlot = page.locator("details summary").first();
if (await firstSlot.count()) {
  await firstSlot.click();
  await beat(1800);
  await shot("04-standing-spots-open");
}
await glide(360);
await beat(1000);

// Front-desk QR check-in
await page.click('[data-tour="tab:/checkin"]');
await page.waitForLoadState("networkidle");
await beat(1700);
await shot("05-checkin");

// Everything else lives one tap away
await page.click('[data-tour="tab:more"]');
await beat(1500);
await shot("06-more-menu");

// Payments, including transfer receipts.
// Scoped to the open sheet: the desktop sidebar carries the same link and is
// present but hidden at this width, so an unscoped selector matches that one.
const payments = page.locator('[role="dialog"] a[href*="/payments"]').first();
if (await payments.count()) {
  await payments.click();
  await page.waitForLoadState("networkidle");
  await beat(1800);
  await shot("07-payments");
  await glide(380);
  await beat(1000);
}

// ── Student ─────────────────────────────────────────────────────
await signIn("ana@example.com");
await beat(1700);
await shot("08-student-classes");
await glide(400);
await beat(1200);

// Booking a class
await page.goto(`${BASE}/es/book`, { waitUntil: "networkidle" });
await beat(1800);
await shot("09-student-book");
await glide(420);
await beat(1400);

// Buying a pack
await page.goto(`${BASE}/es/buy`, { waitUntil: "networkidle" });
await beat(1800);
await shot("10-student-buy");
await beat(900);

console.log("Finishing…");
await context.close();
await browser.close();

console.log(`
  demo/stills/*.png captured

  Now run: npm run demo:encode
`);
