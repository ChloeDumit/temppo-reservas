/**
 * Records the Temppo Beauty product demos by driving the real app.
 *
 *   node marketing/video/record.mjs [reserva|agenda|senas|volver]
 *
 * Needs the production build running with the beauty brand forced:
 *   BRAND_OVERRIDE=1 DEV_BRAND=beauty npx next start -p 8899
 * and the demo studio seeded: npx tsx marketing/video/seed-demo.ts
 *
 * Playwright's own video and Chrome's screencast both capture at CSS pixels,
 * which blurs once enlarged, so this takes full-resolution screenshots as
 * fast as the page renders (about 30 a second) while the script uses the app,
 * and remembers when each one was taken. compose.mjs turns them into video.
 */
import { chromium } from "playwright";
import { config } from "dotenv";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

config({ path: ".env.demo.local" });
const BASE = process.env.DEMO_BASE || "http://localhost:8899";
const SLUG = "lu-nails-studio";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "raw");
const VIEW = { width: 390, height: 844 };
const SCALE = 2.5;

const browser = await chromium.launch();

/** A visible touch, so viewers see where the finger went. */
const TOUCH = () => {
  const style = document.createElement("style");
  style.textContent = `.demo-touch{position:fixed;z-index:2147483647;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;
    background:rgba(181,83,111,.35);border:2px solid rgba(181,83,111,.85);pointer-events:none;animation:demo-touch .55s ease-out forwards}
    @keyframes demo-touch{from{transform:scale(.5);opacity:1}to{transform:scale(1.5);opacity:0}}
    nextjs-portal{display:none!important}`;
  const add = () => document.head.appendChild(style);
  document.head ? add() : document.addEventListener("DOMContentLoaded", add);
  document.addEventListener("pointerdown", (e) => {
    const dot = document.createElement("div");
    dot.className = "demo-touch";
    dot.style.left = e.clientX + "px";
    dot.style.top = e.clientY + "px";
    document.body.appendChild(dot);
    setTimeout(() => dot.remove(), 700);
  }, true);
  localStorage.setItem("temppo:install-dismissed", String(Date.now()));
};

async function staffState() {
  const ctx = await browser.newContext({ viewport: VIEW });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/es/login`);
  await page.fill("#identifier", process.env.DEMO_VIDEO_EMAIL);
  await page.fill("#secret", process.env.DEMO_VIDEO_PASSWORD);
  await page.keyboard.press("Enter");
  await page.waitForURL(/dashboard/, { timeout: 20000 });
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

async function record(name, { staff = false }, script) {
  const dir = path.join(OUT, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: SCALE,
    isMobile: true,
    hasTouch: false,
    locale: "es-UY",
    timezoneId: "America/Montevideo",
    storageState: staff ? await staffState() : undefined,
  });
  await ctx.addInitScript(TOUCH);
  const page = await ctx.newPage();
  // A browser dialog left open blocks screenshots for good: always answer it.
  page.on("dialog", (d) => d.accept().catch(() => {}));
  const cdp = await ctx.newCDPSession(page);

  const frames = [];
  const captions = [];
  let t0 = 0;
  let recording = false;
  let loop = Promise.resolve();

  const start = () => {
    recording = true;
    t0 = Date.now();
    loop = (async () => {
      let i = 0;
      while (recording) {
        const at = Date.now();
        try {
          const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 92, optimizeForSpeed: true });
          const file = `f${String(i++).padStart(5, "0")}.jpg`;
          writeFileSync(path.join(dir, file), Buffer.from(data, "base64"));
          frames.push({ file, t: (at - t0) / 1000 });
        } catch {
          // A navigation in flight: the next frame will catch up.
        }
        const spent = Date.now() - at;
        if (spent < 33) await new Promise((r) => setTimeout(r, 33 - spent));
      }
    })();
  };
  const h = {
    page,
    beat: (ms = 1200) => page.waitForTimeout(ms),
    caption: (text) => captions.push({ t: (Date.now() - t0) / 1000, text }),
    async tap(locator, wait = 700) {
      await locator.scrollIntoViewIfNeeded();
      const box = await locator.boundingBox();
      if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
      await locator.click();
      await page.waitForTimeout(wait);
    },
    /** Shows a touch on an element without activating it (links that leave the app). */
    async point(locator, wait = 900) {
      await locator.scrollIntoViewIfNeeded();
      const box = await locator.boundingBox();
      await page.evaluate(({ x, y }) => document.dispatchEvent(new PointerEvent("pointerdown", { clientX: x, clientY: y, bubbles: true })), { x: box.x + box.width / 2, y: box.y + box.height / 2 });
      await page.waitForTimeout(wait);
    },
    async glide(distance, ms = 900) {
      const steps = Math.max(10, Math.round(ms / 16));
      for (let i = 0; i < steps; i++) {
        await page.mouse.wheel(0, distance / steps);
        await page.waitForTimeout(16);
      }
    },
    async type(locator, text) {
      await h.tap(locator, 200);
      await locator.pressSequentially(text, { delay: 55 });
    },
  };

  // Whatever happens in the script, stop capturing, or the process never ends.
  try {
    page.setDefaultTimeout(15000);
    await script(h, start);
    await h.beat(600);
  } finally {
    recording = false;
    await loop;
  }
  writeFileSync(path.join(dir, "timeline.json"), JSON.stringify({ frames, captions, duration: (Date.now() - t0) / 1000 }, null, 1));
  await ctx.close();
  console.log(`${name}: ${frames.length} frames, ${captions.length} captions`);
}

const DEMOS = {
  // ------------------------------------------------ the client books
  reserva: () =>
    record("reserva", {}, async (h, start) => {
      const { page } = h;
      await page.goto(`${BASE}/es/b/${SLUG}`);
      await page.waitForLoadState("load"); await page.waitForTimeout(700);
      start();
      h.caption("Tu página de reservas, en el link de tu bio");
      await h.beat(1800);
      await h.glide(260);
      await h.beat(700);
      await h.glide(-260);
      h.caption("Eligen el servicio y los extras");
      await h.tap(page.getByRole("button", { name: /Semipermanente/ }));
      await h.tap(page.getByText("Nail art", { exact: true }), 900);
      await h.tap(page.getByRole("button", { name: "Continuar" }));
      h.caption("Con quién quieren atenderse");
      await h.beat(600);
      await h.tap(page.getByRole("button", { name: /Lucía Pereira/ }), 1500);
      h.caption("Solo ven los horarios libres");
      await page.locator("div.grid button").first().waitFor();
      await h.beat(900);
      const days = page.locator("div.overflow-x-auto button:not([disabled])");
      await h.tap(days.nth(1), 1100);
      await h.tap(page.locator("div.grid button").nth(2), 900);
      h.caption("Dejan sus datos y eligen cómo pagar la seña");
      await h.type(page.locator('input[name="name"]'), "Carolina Ferreira");
      await h.type(page.locator('input[name="phone"]'), "099 456 789");
      await h.beat(400);
      await h.tap(page.locator("label", { hasText: "Transferencia" }), 900);
      await h.tap(page.getByRole("button", { name: /Reservar/ }), 300);
      await page.waitForURL(/\/m\//, { timeout: 20000 });
      h.caption("¡Listo! El turno queda guardado");
      await h.beat(2200);
      await h.glide(240, 1000);
      await h.beat(2400);
    }),

  // ------------------------------------------------ the professional's day
  agenda: () =>
    record("agenda", { staff: true }, async (h, start) => {
      const { page } = h;
      await page.goto(`${BASE}/es/dashboard`);
      await page.waitForLoadState("load"); await page.waitForTimeout(700);
      start();
      h.caption("Tu día, de un vistazo");
      await h.beat(2200);
      await h.glide(700, 1400);
      await h.beat(900);
      await h.glide(-700, 900);
      h.caption("Tu agenda del día, por profesional");
      await h.tap(page.locator('nav a[href$="/agenda"]').last(), 1800);
      await h.glide(200, 700);
      await h.beat(700);
      h.caption("La semana entera");
      await h.tap(page.getByRole("link", { name: "Semana", exact: true }), 2000);
      await h.glide(300, 900);
      h.caption("Y el mes completo");
      await h.tap(page.getByRole("link", { name: "Mes", exact: true }), 2200);
      h.caption("Cada turno, con todo a mano");
      await h.tap(page.getByRole("link", { name: "Día", exact: true }), 1400);
      await h.tap(page.getByRole("button", { name: /Florencia Silva/ }).first(), 2600);
      await h.point(page.getByRole("link", { name: "Recordar por WhatsApp" }), 2000);
    }),

  // ------------------------------------------------ deposits
  senas: () =>
    record("senas", { staff: true }, async (h, start) => {
      const { page } = h;
      await page.goto(`${BASE}/es/dashboard`);
      await page.waitForLoadState("load"); await page.waitForTimeout(700);
      start();
      h.caption("Las señas pendientes, arriba de todo");
      await h.beat(2200);
      h.caption("¿Llegó la transferencia? Un toque y listo");
      await h.tap(page.getByRole("button", { name: "Pagada por transferencia" }).first(), 2600);
      h.caption("Vos decidís cuánto, en cada servicio");
      await page.goto(`${BASE}/es/services`);
      await page.waitForLoadState("load"); await page.waitForTimeout(700);
      await h.beat(1200);
      await h.tap(page.getByRole("button", { name: "Editar" }).first(), 1500);
      await h.glide(260, 900);
      await h.beat(1600);
      // Close the sheet first: leaving with it open stalls the capture.
      await page.keyboard.press("Escape");
      await h.beat(500);
      h.caption("Y cómo se cobra: Mercado Pago o transferencia");
      await page.goto(`${BASE}/es/hours`);
      await page.waitForLoadState("load"); await page.waitForTimeout(700);
      await page.getByText("Cómo pueden pagar la seña").scrollIntoViewIfNeeded();
      await h.glide(200, 600);
      await h.beat(2800);
    }),

  // ------------------------------------------------ time to come back
  volver: () =>
    record("volver", { staff: true }, async (h, start) => {
      const { page } = h;
      await page.goto(`${BASE}/es/dashboard`);
      await page.waitForLoadState("load"); await page.waitForTimeout(700);
      const widget = page.getByRole("heading", { name: "Para invitar a volver" });
      await widget.scrollIntoViewIfNeeded();
      await h.glide(-120, 200);
      start();
      h.caption("Te avisa a quién le toca volver");
      await h.beat(2400);
      h.caption("Le escribís por WhatsApp con un toque");
      await h.point(page.getByRole("link", { name: "WhatsApp" }).first(), 2000);
      h.caption("Y tenés su ficha siempre a mano");
      await h.tap(widget.locator("xpath=ancestor::section[1]").locator("a[href*='/clients/']").first(), 2000);
      await h.glide(380, 1100);
      await h.beat(1200);
      await h.glide(520, 1100);
      await h.beat(2200);
    }),
};

const wanted = process.argv[2] ? [process.argv[2]] : Object.keys(DEMOS);
for (const name of wanted) await DEMOS[name]();
await browser.close();
