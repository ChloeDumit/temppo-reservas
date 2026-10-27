/**
 * End-to-end check of Temppo Beauty against the local dev server.
 *
 *   npm run seed:beauty && node scripts/e2e-beauty.mjs
 *
 * Two halves. The first opens every screen an owner, a professional and a
 * client see, on a phone, a tablet and a computer, and flags what breaks:
 * errors, content wider than the screen, and sheets whose submit button
 * cannot be reached. The second walks the product end to end through the UI
 * — services, hours, clients, agenda, a public booking paid by transfer, its
 * approval, rescheduling and cancelling, settings and the team — and says
 * which step failed.
 *
 * Screenshots land in E2E_OUT (default ./e2e-shots, git-ignored).
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = process.env.E2E_OUT || "e2e-shots";
const OWNER = { email: "lu@studiolu.uy", password: "beauty1234" };
const es = JSON.parse(readFileSync("src/messages/es.json", "utf8"));

const VIEWPORTS = {
  phone: { width: 375, height: 812, isMobile: true, hasTouch: true },
  tablet: { width: 768, height: 1024, isMobile: true, hasTouch: true },
  desktop: { width: 1366, height: 900 },
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const problems = [];
let passed = 0;
const ok = (label) => {
  passed++;
  console.log(`  ok    ${label}`);
};
const fail = (label, detail) => {
  problems.push(`${label}${detail ? ` — ${detail}` : ""}`);
  console.log(` FAIL   ${label}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();

async function newPage(viewport) {
  const context = await browser.newContext({ viewport: VIEWPORTS[viewport], deviceScaleFactor: 1, locale: "es-UY" });
  await context.addCookies([{ name: "brand_override", value: "beauty", url: BASE }]);
  // The guided tour and the install prompt would sit over every screen.
  await context.addInitScript(() => {
    try {
      localStorage.setItem("temppo:tour-seen", "1");
      localStorage.setItem("temppo:install-dismissed", "1");
    } catch {}
  });
  const page = await context.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e.message).slice(0, 200)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    // Dev-only noise: HMR sockets, missing favicons, the Next dev overlay.
    if (/favicon|webpack-hmr|_next\/webpack|Download the React DevTools/.test(text)) return;
    page.errors.push(text.slice(0, 200));
  });
  return page;
}

async function login(page, { email, password }) {
  await page.goto(`${BASE}/es/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="identifier"]', email);
  await page.fill('input[name="secret"]', password);
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 15000 }), page.keyboard.press("Enter")]);
}

/** What spills past the right edge, by a readable selector. */
async function overflow(page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > width + 1) {
        // Skip children of something that scrolls horizontally on purpose.
        let p = el.parentElement;
        let scrolls = false;
        while (p) {
          const s = getComputedStyle(p);
          if (/(auto|scroll|hidden)/.test(s.overflowX) && p.scrollWidth > p.clientWidth) {
            scrolls = true;
            break;
          }
          p = p.parentElement;
        }
        if (scrolls) continue;
        const name = el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "") + (el.className && typeof el.className === "string" ? `.${el.className.split(" ").slice(0, 2).join(".")}` : "");
        out.push(`${name} (${Math.round(r.right)}px > ${width}px)`);
      }
    }
    return [...new Set(out)].slice(0, 5);
  });
}

async function audit(page, viewport, label, path) {
  page.errors = [];
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const status = res?.status() ?? 0;
  const text = await page.locator("body").innerText();
  const tag = `${viewport} ${label}`;
  if (status >= 400) return fail(tag, `HTTP ${status}`);
  if (/Application error|Unhandled Runtime Error|Internal Server Error/i.test(text)) return fail(tag, "error page");
  const spill = await overflow(page);
  if (spill.length) fail(`${tag} fits the screen`, spill.join(", "));
  else ok(`${tag} fits the screen`);
  if (page.errors.length) fail(`${tag} no console errors`, page.errors.join(" | "));
  await page.screenshot({ path: join(OUT, `${viewport}-${label}.png`), fullPage: true });
}

/** Opens every sheet on the page and checks its submit button can be reached. */
async function auditSheets(page, viewport, label) {
  const triggers = page.locator("main button[aria-haspopup='dialog'], main [data-sheet-trigger]");
  const count = await triggers.count();
  for (let i = 0; i < count; i++) {
    const trigger = triggers.nth(i);
    if (!(await trigger.isVisible())) continue;
    const name = (await trigger.innerText()).trim().split("\n")[0] || `sheet ${i}`;
    await trigger.click();
    const dialog = page.locator("[role='dialog']").last();
    await dialog.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
    // Let the sheet finish sliding in before measuring anything inside it.
    await page.waitForTimeout(500);
    const submit = dialog.locator("button[type='submit']").last();
    if (await submit.count()) {
      await submit.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(200);
      const box = await submit.boundingBox();
      const vh = page.viewportSize().height;
      // Something covering the button (a tab bar, a toolbar) eats the tap.
      const hit = box
        ? await page.evaluate(
            ([x, y]) => {
              const el = document.elementFromPoint(x, y);
              return el?.closest("button[type='submit']") ? true : el?.outerHTML.slice(0, 80);
            },
            [box.x + box.width / 2, box.y + box.height / 2],
          )
        : "no box";
      if (!box || box.y + box.height > vh || hit !== true) fail(`${viewport} ${label} › "${name}" submit reachable`, String(hit));
      else ok(`${viewport} ${label} › "${name}" submit reachable`);
    }
    await page.screenshot({ path: join(OUT, `${viewport}-${label}-sheet-${i}.png`) });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  }
}

// ---------------------------------------------------------------- half one

// E2E_ONLY=screens or E2E_ONLY=flows runs one half.
const ONLY = process.env.E2E_ONLY;

if (ONLY !== "flows") console.log("\nEvery screen, every device");
for (const viewport of ONLY === "flows" ? [] : Object.keys(VIEWPORTS)) {
  const page = await newPage(viewport);
  await audit(page, viewport, "landing", "/es");
  await audit(page, viewport, "booking-page", "/es/b/studio-lu");
  await login(page, OWNER);
  const client = await page.evaluate(async () => null);
  for (const [label, path] of [
    ["home", "/es/dashboard"],
    ["agenda", "/es/agenda"],
    ["clients", "/es/clients"],
    ["services", "/es/services"],
    ["payments", "/es/payments"],
    ["hours", "/es/hours"],
    ["reports", "/es/reports"],
    ["settings", "/es/settings"],
  ]) {
    await audit(page, viewport, label, path);
    await auditSheets(page, viewport, label);
  }
  // A client's file.
  await page.goto(`${BASE}/es/clients`, { waitUntil: "networkidle" });
  const first = page.locator("main a[href*='/clients/']").first();
  if (await first.count()) {
    const href = await first.getAttribute("href");
    await audit(page, viewport, "client-file", href);
  } else fail(`${viewport} client file`, "no client to open");
  void client;
  await page.context().close();
}


// ---------------------------------------------------------------- half two

/** Runs one flow; a failure is reported with a screenshot and the run goes on. */
async function flow(page, label, fn) {
  try {
    await fn();
    ok(label);
  } catch (error) {
    fail(label, String(error.message).split("\n")[0].slice(0, 220));
    await page.screenshot({ path: join(OUT, `flow-${label.replace(/\W+/g, "-")}.png`) }).catch(() => {});
  }
}

const sheet = (page) => page.locator("[role='dialog']").last();
async function openSheet(page, label) {
  await page.getByRole("button", { name: label, exact: true }).first().click();
  await sheet(page).waitFor({ state: "visible" });
  await page.waitForTimeout(400);
}
/** The next weekday at least two days out, as YYYY-MM-DD, so slots exist and nothing is in the past. */
function nextWeekday(offset = 2) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA");
}
const until = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("timed out waiting");
};

for (const viewport of ONLY === "screens" ? [] : ["phone", "desktop"]) {
  console.log(`\nThe whole product, on ${viewport}`);
  const tag = (s) => `${viewport}: ${s}`;
  const page = await newPage(viewport);
  await login(page, OWNER);
  const stamp = `${viewport}${Date.now() % 100000}`;
  const day = nextWeekday(viewport === "phone" ? 2 : 3);

  await flow(page, tag("add a client by hand"), async () => {
    await page.goto(`${BASE}/es/clients`, { waitUntil: "networkidle" });
    await openSheet(page, es.clients.new);
    const d = sheet(page);
    await d.locator("input[name=name]").fill(`Clienta ${stamp}`);
    await d.locator("input[name=phone]").fill(`09${String(Date.now()).slice(-7)}`);
    await d.locator("input[name=allergies]").fill("Látex");
    await d.locator("button[type=submit]").click();
    await page.waitForURL(/\/clients\/[^/]+$/, { timeout: 10000 });
    await page.getByText(`Clienta ${stamp}`).first().waitFor();
  });

  await flow(page, tag("a client with the same phone is not duplicated"), async () => {
    await page.goto(`${BASE}/es/clients`, { waitUntil: "networkidle" });
    await openSheet(page, es.clients.new);
    const d = sheet(page);
    await d.locator("input[name=name]").fill("Ana Repetida");
    await d.locator("input[name=phone]").fill("099 111 222");
    await d.locator("button[type=submit]").click();
    await d.getByText(es.clients.exists).waitFor({ timeout: 8000 });
    await page.keyboard.press("Escape");
  });

  await flow(page, tag("edit a client's file"), async () => {
    await page.goto(`${BASE}/es/clients?q=Ana`, { waitUntil: "networkidle" });
    await page.locator("main a[href*='/clients/']").first().click();
    await page.waitForURL(/\/clients\/[^/]+$/);
    await page.locator("textarea[name=notes]").fill(`Fórmula ${stamp}`);
    await page.locator("form:has(textarea[name=notes]) button[type=submit]").click();
    await page.getByText(es.clients.saved).waitFor({ timeout: 8000 });
  });

  await flow(page, tag("block time and see it listed"), async () => {
    await page.goto(`${BASE}/es/hours`, { waitUntil: "networkidle" });
    await openSheet(page, es.hours.newBlock);
    const d = sheet(page);
    await d.locator("input[name=fromDate]").fill(day);
    await d.locator("input[name=fromTime]").fill("10:00");
    await d.locator("input[name=toDate]").fill(day);
    await d.locator("input[name=toTime]").fill("12:00");
    await d.locator("input[name=reason]").fill(`Médico ${stamp}`);
    await d.locator("button[type=submit]").click();
    await page.getByText(`Médico ${stamp}`).first().waitFor({ timeout: 8000 });
  });

  await flow(page, tag("remove a block"), async () => {
    const row = page.locator("li", { hasText: `Médico ${stamp}` }).first();
    await row.getByRole("button", { name: es.common.delete }).click();
    await until(async () => (await page.getByText(`Médico ${stamp}`).count()) === 0);
  });

  await flow(page, tag("save the booking rules"), async () => {
    await page.goto(`${BASE}/es/hours#rules`, { waitUntil: "networkidle" });
    const form = page.locator("form:has(input[name=reminderHoursBefore])");
    await form.locator("input[name=reminderHoursBefore]").fill("24");
    await form.locator("button[type=submit]").click();
    await form.getByText(/Guardado|Listo|✓/).first().waitFor({ timeout: 8000 });
  });

  await flow(page, tag("add a service"), async () => {
    await page.goto(`${BASE}/es/services`, { waitUntil: "networkidle" });
    await openSheet(page, es.services.newService);
    const d = sheet(page);
    await d.locator("input[name=name]").fill(`Servicio ${stamp}`);
    await d.locator("input[name=durationMin]").fill("45");
    await d.locator("input[name=price]").fill("800");
    await d.locator("button[type=submit]").click();
    await page.getByText(`Servicio ${stamp}`).first().waitFor({ timeout: 8000 });
  });

  await flow(page, tag("book from the agenda for a new client"), async () => {
    await page.goto(`${BASE}/es/agenda?date=${day}`, { waitUntil: "networkidle" });
    await openSheet(page, es.agenda.newAppointment);
    const d = sheet(page);
    if (await d.getByRole("button", { name: `+ ${es.agenda.newClient}` }).count()) {
      await d.getByRole("button", { name: `+ ${es.agenda.newClient}` }).click();
    }
    await d.locator("input[name=clientName]").fill(`Agenda ${stamp}`);
    await d.locator("input[name=clientPhone]").fill(`098${String(Date.now()).slice(-6)}`);
    await d.locator("select[name=serviceId]").selectOption({ label: /Perfilado/ }).catch(async () => {
      const opts = await d.locator("select[name=serviceId] option").allTextContents();
      await d.locator("select[name=serviceId]").selectOption({ label: opts.find((o) => o.includes("Perfilado")) });
    });
    await d.locator("input[name=date]").fill(day);
    await d.locator("input[name=time], select[name=time]").first().fill?.("15:00").catch(() => {});
    if (await d.locator("select[name=time]").count()) {
      const opts = await d.locator("select[name=time] option").allTextContents();
      await d.locator("select[name=time]").selectOption({ label: opts.find((o) => /15/.test(o)) ?? opts[1] });
    }
    await d.locator("button[type=submit]").click();
    await page.getByText(`Agenda ${stamp}`).first().waitFor({ timeout: 10000 });
  });

  await flow(page, tag("open it, take a note and charge it"), async () => {
    await page.getByText(`Agenda ${stamp}`).first().click();
    const d = sheet(page);
    await d.waitFor({ state: "visible" });
    await d.locator("textarea[name=staffNotes]").fill("Color 7.1");
    await d.getByRole("button", { name: es.agenda.saveNote }).click();
    await d.getByText(es.agenda.noteSaved).waitFor({ timeout: 8000 });
    await d.getByRole("button", { name: es.agenda.charge, exact: true }).click();
    await d.getByText(es.agenda.fullyPaid).waitFor({ timeout: 8000 });
    await page.keyboard.press("Escape");
  });

  await flow(page, tag("set transfer details"), async () => {
    await page.goto(`${BASE}/es/hours#rules`, { waitUntil: "networkidle" });
    const form = page.locator("form:has(textarea[name=transferInstructions])");
    await form.locator("textarea[name=transferInstructions]").fill(`BROU ${stamp}`);
    await form.locator("button[type=submit]").click();
    await form.getByText(/Guardado|Listo|✓/).first().waitFor({ timeout: 8000 });
  });

  // A client books on the public page and pays by transfer.
  const pub = await newPage(viewport);
  let manageUrl = "";
  const clientName = `Pública ${stamp}`;
  await flow(pub, tag("a client books online paying by transfer"), async () => {
    await pub.goto(`${BASE}/es/b/studio-lu`, { waitUntil: "networkidle" });
    await pub.getByRole("button", { name: /Esmaltado semipermanente/ }).click();
    if (await pub.getByRole("button", { name: es.bookPublic.noExtras }).count()) {
      await pub.getByRole("button", { name: es.bookPublic.noExtras }).click();
    }
    if (await pub.getByRole("button", { name: new RegExp(es.bookPublic.anyone) }).count()) {
      await pub.getByRole("button", { name: new RegExp(es.bookPublic.anyone) }).click();
    }
    const slot = pub.locator("main button.tabular-nums, button.tabular-nums").filter({ hasText: /\d{1,2}:\d{2}/ }).first();
    await slot.waitFor({ timeout: 15000 });
    await slot.click();
    await pub.locator("input[name=name]").fill(clientName);
    await pub.locator("input[name=phone]").fill(`091${String(Date.now()).slice(-6)}`);
    await pub.locator("input[name=email]").fill(`cliente${stamp}@example.com`);
    const transfer = pub.getByText(es.bookPublic.payTransfer, { exact: true });
    if (await transfer.count()) await transfer.click();
    await pub.locator("form button[type=submit]").click();
    await pub.waitForURL(/\/m\/[^/?]+/, { timeout: 15000 });
    manageUrl = pub.url();
    await pub.getByText(es.manage.statusPending).first().waitFor();
    await pub.getByText(`BROU ${stamp}`).waitFor({ timeout: 5000 });
  });

  await flow(page, tag("the studio approves the transfer"), async () => {
    await page.goto(`${BASE}/es/payments`, { waitUntil: "networkidle" });
    const row = page.locator("li, tr", { hasText: clientName }).first();
    await row.waitFor({ timeout: 8000 });
    await row.getByRole("button", { name: es.payments.approve }).click();
    await until(async () => (await page.locator("li, tr", { hasText: clientName }).getByRole("button", { name: es.payments.approve }).count()) === 0);
  });

  await flow(pub, tag("the client sees it confirmed"), async () => {
    await pub.goto(manageUrl, { waitUntil: "networkidle" });
    await pub.getByText(es.manage.statusConfirmed).first().waitFor({ timeout: 8000 });
  });

  await flow(pub, tag("the client moves it to another time"), async () => {
    await pub.getByRole("button", { name: es.manage.reschedule }).click();
    const slot = pub.locator("button.tabular-nums").filter({ hasText: /\d{1,2}:\d{2}/ }).nth(2);
    await slot.waitFor({ timeout: 15000 });
    const before = await pub.locator("main").innerText();
    await slot.click();
    await pub.getByRole("button", { name: /^Pasar a / }).click();
    await until(async () => (await pub.locator("main").innerText()) !== before, 10000);
  });

  await flow(pub, tag("the client cancels"), async () => {
    await pub.goto(manageUrl, { waitUntil: "networkidle" });
    await pub.getByRole("button", { name: es.manage.cancel }).click();
    await pub.getByRole("button", { name: es.manage.yesCancel }).click();
    await pub.getByText(es.manage.statusCancelled).first().waitFor({ timeout: 10000 });
  });
  await pub.context().close();

  await flow(page, tag("save the business details"), async () => {
    await page.goto(`${BASE}/es/settings`, { waitUntil: "networkidle" });
    const form = page.locator("#studio form");
    await form.locator("button[type=submit]").click();
    await form.getByText(es.common.saved).first().waitFor({ timeout: 8000 });
  });

  let tempPassword = "";
  const proEmail = `pro${stamp}@studiolu.uy`;
  await flow(page, tag("invite a professional"), async () => {
    await page.goto(`${BASE}/es/settings#team`, { waitUntil: "networkidle" });
    const form = page.locator("#team form").last();
    await form.locator("input[name=name]").fill(`Pro ${stamp}`);
    await form.locator("input[name=email]").fill(proEmail);
    await form.locator("button[type=submit]").click();
    const shown = page.locator("#team .font-display").first();
    await shown.waitFor({ timeout: 8000 });
    tempPassword = (await shown.innerText()).trim();
    if (!tempPassword) throw new Error("no temporary password shown");
  });

  if (tempPassword) {
    const pro = await newPage(viewport);
    await flow(pro, tag("the professional signs in and sets her password"), async () => {
      await login(pro, { email: proEmail, password: tempPassword });
      await pro.waitForURL(/\/password/, { timeout: 10000 });
      await pro.locator("input[name=password]").fill("profesional123");
      await pro.locator("input[name=confirm]").fill("profesional123");
      await pro.locator("button[type=submit]").click();
      await pro.waitForURL((u) => !u.pathname.includes("/password"), { timeout: 10000 });
    });
    await flow(pro, tag("she reaches her agenda and hours, not the settings"), async () => {
      const agenda = await pro.goto(`${BASE}/es/agenda`, { waitUntil: "networkidle" });
      if ((agenda?.status() ?? 500) >= 400) throw new Error(`agenda ${agenda?.status()}`);
      await pro.goto(`${BASE}/es/settings`, { waitUntil: "networkidle" });
      if (pro.url().includes("/settings")) throw new Error("a professional can open Ajustes");
    });
    await pro.context().close();
  }

  await page.context().close();
}

await browser.close();

console.log(`\n${passed} passed, ${problems.length} failed`);
if (problems.length) {
  console.log("\nTo fix:");
  for (const p of problems) console.log(`  - ${p}`);
  process.exitCode = 1;
}
