/**
 * Records a reel by actually using the app.
 *
 *   npm run reel:rec -- sena
 *
 * The earlier reels were a slideshow: high-resolution stills with a slow
 * push-in and a caption pill along the bottom, which reads as a screenshot
 * with a subtitle rather than as somebody booking a court. This drives the
 * real app and records the frames Chromium composites while it happens, so
 * the scrolling, the step transitions and the pressing are the film.
 *
 * Two things make it legible as an interaction. A ring follows the pointer and
 * flashes where it presses, injected into the page so it moves with the real
 * mouse rather than being drawn on afterwards. And the narration is cut in as
 * full-frame type between the actions, never laid over the screen.
 *
 * Needs the app running on PORT (default 3000) and `npm run seed:padel`.
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const BASE = `http://localhost:${process.env.PORT || 3000}`;
const OUT = "demo";

/*
  A screencast frame arrives at the page's CSS size whatever the device scale
  factor is, so the viewport is the recording's real resolution. 540×960 is
  the compromise: it is under the 640px phone breakpoint, so the app lays out
  as a phone, and it needs only a 2× enlargement to reach 1080×1920.
*/
const VW = 540;
const VH = 960;
const W = 1080;
const H = 1920;
const FPS = 30;

const INK = "#1C1917";
const PAPER = "#FAF7F4";
const ACCENT = "#E07A5F";

/* ------------------------------------------------------------- the cards */

const MASCOT = `
  <ellipse cx="50" cy="90" rx="22" ry="5" fill="#C85C35" opacity="0.3"/>
  <circle cx="50" cy="50" r="36" fill="#E07A5F"/>
  <path d="M22 60 Q50 85 78 60 Q75 78 50 82 Q25 78 22 60Z" fill="#C85C35"/>
  <ellipse cx="37" cy="84" rx="8" ry="5" fill="#E07A5F"/>
  <ellipse cx="63" cy="84" rx="8" ry="5" fill="#E07A5F"/>
  <circle cx="55" cy="42" r="12" fill="#FFFFFF"/>
  <circle cx="58" cy="43" r="6" fill="#3D2010"/>
  <circle cx="60" cy="40" r="2.5" fill="#FFFFFF"/>
  <path d="M40 58 Q50 66 60 58" stroke="#3D2010" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  <path d="M80 50 Q90 42 88 32 Q86 24 78 28" stroke="#C85C35" stroke-width="5" stroke-linecap="round" fill="none"/>
`;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** The first frame: the question the club already has, before any branding. */
function hookCard({ line1, line2, sub }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="${INK}"/>
    <text x="${W / 2}" y="${H / 2 - 40}" text-anchor="middle" font-family="Helvetica,Arial" font-size="96" font-weight="bold" fill="#FFFFFF">${esc(line1)}</text>
    <text x="${W / 2}" y="${H / 2 + 80}" text-anchor="middle" font-family="Helvetica,Arial" font-size="96" font-weight="bold" fill="${ACCENT}">${esc(line2)}</text>
    <text x="${W / 2}" y="${H / 2 + 230}" text-anchor="middle" font-family="Helvetica,Arial" font-size="40" fill="#A8A29E">${esc(sub)}</text>
  </svg>`;
}

/**
 * A line of narration, cut in rather than laid over the screen. One short
 * line, centred, big: it is on for under a second and has to be read in a
 * glance, which a sentence along the bottom never is.
 */
function beatCard(lines) {
  const size = 86;
  const start = H / 2 - ((lines.length - 1) * size * 1.18) / 2 + size * 0.35;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="${INK}"/>
    ${lines
      .map(
        (line, i) =>
          `<text x="${W / 2}" y="${start + i * size * 1.18}" text-anchor="middle" font-family="Helvetica,Arial" font-size="${size}" font-weight="bold" fill="#FFFFFF">${esc(line)}</text>`,
      )
      .join("\n")}
  </svg>`;
}

function outroCard({ title, subtitle, cta }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="${PAPER}"/>
    <g transform="translate(${W / 2 - 110} 620) scale(2.2)">${MASCOT}</g>
    <text x="${W / 2}" y="1070" text-anchor="middle" font-family="Helvetica,Arial" font-size="90" font-weight="bold" fill="${INK}">${esc(title)}</text>
    <text x="${W / 2}" y="1150" text-anchor="middle" font-family="Helvetica,Arial" font-size="42" fill="#57534E">${esc(subtitle)}</text>
    <rect x="${W / 2 - 290}" y="1270" width="580" height="112" rx="56" fill="${ACCENT}"/>
    <text x="${W / 2}" y="1344" text-anchor="middle" font-family="Helvetica,Arial" font-size="46" font-weight="bold" fill="#FFFFFF">${esc(cta)}</text>
  </svg>`;
}

/* ------------------------------------------------------- the pointer ring */

/*
  Injected into the page, so it follows the real mouse: Playwright's clicks
  are real events, and a ring drawn in post from recorded coordinates always
  teleports. It also flashes on press, which is the frame that reads as
  somebody using the thing rather than a page that changed by itself.
*/
const POINTER = () => {
  const ring = document.createElement("div");
  /*
    An outline, not a disc. Filled, it sat on top of the row it was pressing
    and hid the very label the film is pointing at; empty, it reads as a
    fingertip and what is underneath stays legible. The press flashes it in
    the brand's accent, which is the frame that says «pressed».
  */
  ring.style.cssText = [
    "position:fixed",
    "z-index:2147483647",
    "width:46px",
    "height:46px",
    "margin:-23px 0 0 -23px",
    "border-radius:50%",
    "border:3px solid rgba(28,25,23,.5)",
    "box-shadow:0 2px 10px rgba(28,25,23,.18)",
    "background:transparent",
    "pointer-events:none",
    "opacity:0",
    "transition:opacity .25s ease, transform .16s ease, background-color .16s ease",
    "left:50%",
    "top:50%",
  ].join(";");
  /*
    Into the body, and put back if something takes it out. A div parented to
    <html> instead does not reliably paint, which is how the first recording
    came out with no ring at all. The same timer drops `next dev`'s own badge,
    which sits in a shadow root and so cannot be styled away.
  */
  const attach = () => {
    if (!document.body) return;
    if (!ring.isConnected) document.body.appendChild(ring);
    document.querySelector("nextjs-portal")?.remove();
  };
  attach();
  document.addEventListener("DOMContentLoaded", attach, { once: true });
  setInterval(attach, 400);

  addEventListener(
    "mousemove",
    (e) => {
      ring.style.opacity = "1";
      ring.style.left = `${e.clientX}px`;
      ring.style.top = `${e.clientY}px`;
    },
    true,
  );
  addEventListener(
    "mousedown",
    () => {
      ring.style.transform = "scale(.66)";
      ring.style.backgroundColor = "rgba(224,122,95,.45)";
    },
    true,
  );
  addEventListener(
    "mouseup",
    () => {
      ring.style.transform = "scale(1)";
      ring.style.backgroundColor = "transparent";
    },
    true,
  );
};

/* ----------------------------------------------------------- the recorder */

async function record(cut) {
  const WORK = join(OUT, `rec-${cut.key}`);
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  mkdirSync(join(OUT, "cards"), { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: VW, height: VH },
    locale: "es-UY",
    timezoneId: "America/Montevideo",
    reducedMotion: "no-preference",
  });

  await context.addInitScript(() => {
    localStorage.setItem("temppo:tour-seen", "1");
    localStorage.setItem("temppo:install-dismissed", "1");
  });
  await context.addInitScript(POINTER);

  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  const frames = [];
  let marks = [];
  /*
    Stopping the cast does not stop frames arriving: the ones already in
    flight still turn up, which is how the sign-in page ended up in a film
    that had supposedly cut away from it. The flag decides what is kept; the
    acknowledgement is sent either way.
  */
  let casting = true;

  cdp.on("Page.screencastFrame", async (f) => {
    if (casting) frames.push({ data: f.data, t: f.metadata.timestamp });
    try {
      await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId });
    } catch {
      // The cast is already stopped; the frame still counts.
    }
  });

  /** What a cut's script can do, in the language of somebody using the app. */
  const ui = {
    page,
    async goto(path) {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
      // The pointer starts in the middle, where a thumb would be.
      await page.mouse.move(VW / 2, VH * 0.62);
    },
    async pause(ms = 700) {
      await page.waitForTimeout(ms);
    },
    /** Glides to the element and presses it, so the ring travels there. */
    async tap(locator, { settle = 900 } = {}) {
      const box = await locator.boundingBox();
      if (!box) throw new Error("nothing to tap");
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y, { steps: 18 });
      await page.waitForTimeout(260);
      await page.mouse.down();
      await page.waitForTimeout(90);
      await page.mouse.up();
      await page.waitForTimeout(settle);
    },
    option(text) {
      return page.locator("section li button", { hasText: text }).first();
    },
    optionAt(i) {
      return page.locator("section li button").nth(i);
    },
    async fill(selector, value) {
      const field = page.locator(selector);
      await this.tap(field, { settle: 120 });
      // Typed, not set: a field filling in is part of what is being shown.
      await field.type(value, { delay: 55 });
      await page.waitForTimeout(400);
    },
    /** A slow wheel, so the scroll reads as a hand rather than a jump. */
    async scroll(distance, steps = 28) {
      for (let i = 0; i < steps; i++) {
        await page.mouse.wheel(0, distance / steps);
        await page.waitForTimeout(16);
      }
      await page.waitForTimeout(500);
    },
    /**
     * Runs something without recording it — signing in, mostly. Typing an
     * address and a password is eleven seconds of a reel spent on the one
     * part of the product nobody is being sold.
     */
    async offstage(run) {
      casting = false;
      await cdp.send("Page.stopScreencast");
      await run();
      await cdp.send("Page.startScreencast", {
        format: "jpeg",
        quality: 92,
        maxWidth: VW,
        maxHeight: VH,
        everyNthFrame: 1,
      });
      await page.waitForTimeout(250);
      casting = true;
    },
    /** Cuts a line of narration in here. */
    beat(...lines) {
      marks.push({ t: frames.length ? frames[frames.length - 1].t : 0, lines });
    },
  };

  console.log(`Grabando «${cut.key}»…`);
  await ui.goto(cut.start);
  await page.waitForTimeout(1200);

  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 92,
    maxWidth: VW,
    maxHeight: VH,
    everyNthFrame: 1,
  });

  await cut.run(ui);
  await page.waitForTimeout(900);
  await cdp.send("Page.stopScreencast");
  await browser.close();

  if (frames.length < 10) throw new Error(`Sólo ${frames.length} cuadros: ¿el servidor está en ${BASE}?`);
  console.log(`  ${frames.length} cuadros, ${(frames.at(-1).t - frames[0].t).toFixed(1)}s`);

  return { WORK, frames, marks };
}

/* ------------------------------------------------------------ the encoder */

const ff = (args) => execFileSync("ffmpeg", ["-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });

/** Writes one stretch of recorded frames out as a clip, at its real timing. */
async function footageClip(WORK, frames, from, to, index) {
  const slice = frames.slice(from, to);
  if (slice.length === 0) return null;

  const list = [];
  for (const [i, frame] of slice.entries()) {
    const file = join(WORK, `f-${index}-${String(i).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(frame.data, "base64"));
    const next = slice[i + 1];
    /*
      Capped as well as floored. A frame's duration is the gap until the next
      one, and the cast emits nothing while the page sits still — a dev-server
      hiccup, or a stretch played offstage, would otherwise hold one frame on
      screen for as long as it lasted.
    */
    const seconds = next ? Math.min(Math.max(1 / 60, next.t - frame.t), 0.5) : 1 / FPS;
    list.push(`file '${file.split("/").pop()}'`, `duration ${seconds.toFixed(4)}`);
  }
  // The concat demuxer ignores the last duration unless the file repeats.
  list.push(`file '${list[list.length - 2].slice(6, -1)}'`);

  const listFile = join(WORK, `clip-${index}.txt`);
  writeFileSync(listFile, list.join("\n") + "\n");

  const clip = join(WORK, `clip-${index}.mp4`);
  ff([
    "-f", "concat", "-safe", "0", "-i", listFile,
    "-vf", `scale=${W}:${H}:flags=lanczos:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x1C1917,setsar=1,fps=${FPS}`,
    "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
    clip,
  ]);
  return clip;
}

async function cardClip(WORK, svg, seconds, name) {
  const png = join(WORK, `${name}.png`);
  await sharp(Buffer.from(svg)).png().toFile(png);
  const clip = join(WORK, `${name}.mp4`);
  ff([
    "-loop", "1", "-t", String(seconds), "-i", png,
    "-vf", `scale=${W}:${H},setsar=1,fps=${FPS}`,
    "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
    clip,
  ]);
  return clip;
}

async function build(cut, { WORK, frames, marks }) {
  console.log("Montando…");

  const pieces = [await cardClip(WORK, hookCard(cut.hook), 1.9, "hook")];

  /*
    The narration splits the footage: everything up to a mark, then the card,
    then on. Cut rather than dissolved — a hard cut is what makes it read as
    edited instead of as a slideshow fading between screenshots.
  */
  let from = 0;
  for (const [i, mark] of marks.entries()) {
    const at = frames.findIndex((f) => f.t >= mark.t);
    const to = at < 0 ? frames.length : at;
    const clip = await footageClip(WORK, frames, from, to, i);
    if (clip) pieces.push(clip);
    pieces.push(await cardClip(WORK, beatCard(mark.lines), 0.95, `beat-${i}`));
    from = to;
  }

  const tail = await footageClip(WORK, frames, from, frames.length, marks.length);
  if (tail) pieces.push(tail);
  pieces.push(await cardClip(WORK, outroCard(cut.outro), 2.6, "outro"));

  const listFile = join(WORK, "reel.txt");
  writeFileSync(listFile, pieces.map((p) => `file '${p.split("/").pop()}'`).join("\n") + "\n");

  const master = join(OUT, `${cut.name}.mp4`);
  ff([
    "-f", "concat", "-safe", "0", "-i", listFile,
    "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    master,
  ]);

  ff(["-i", master, "-ss", "3.2", "-frames:v", "1", join(OUT, `${cut.name}-poster.jpg`)]);

  const seconds = execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", master,
  ])
    .toString()
    .trim();

  console.log(`\n  ${master}   ${W}x${H}, ${Number(seconds).toFixed(0)}s\n`);
}

/* --------------------------------------------------------------- the cuts */

const CUTS = {
  /** «La seña»: the booking, and then the screen that holds the court. */
  sena: {
    key: "sena",
    name: "temppo-sena",
    start: "/es/r/club-del-este",
    hook: { line1: "El que no viene", line2: "te costó la cancha", sub: "Con la seña, no" },
    outro: { title: "Cobrá la seña", subtitle: "Si no la pagan, se libera sola.", cta: "temppo.uy" },
    async run(ui) {
      await ui.pause(600);
      await ui.tap(ui.option("Pádel"));
      await ui.tap(ui.option("1 h 30"));
      await ui.tap(ui.optionAt(1));
      await ui.pause(500);

      ui.beat("Elige su horario,", "con su precio");
      const slots = ui.page.locator("section .grid button");
      await ui.tap(slots.nth(Math.min(20, (await slots.count()) - 1)));
      await ui.pause(700);
      await ui.scroll(360);

      ui.beat("Y antes de confirmar", "ve que hay seña");
      await ui.fill('input[autocomplete="name"]', "Joaquín Ferrés");
      await ui.fill('input[autocomplete="tel"]', "099 456 789");
      await ui.pause(500);
      await ui.tap(ui.page.locator("section button").last(), { settle: 2600 });

      ui.beat("La cancha queda retenida,", "no tomada");
      await ui.pause(900);
      await ui.tap(ui.page.locator('a[href*="/m/"]').first(), { settle: 2400 });
      await ui.pause(800);
      await ui.scroll(300);

      ui.beat("Mercado Pago", "o transferencia");
      await ui.pause(1400);
    },
  },

  /*
    «¿Cuántas canchas perdés por semana?». The long one: the player books, the
    court is held against a seña, and the club sees it land. Both sides, which
    is the whole argument.
  */
  canchas: {
    key: "canchas",
    name: "temppo-canchas",
    start: "/es/r/club-del-este",
    hook: { line1: "¿Cuántas canchas", line2: "perdés por semana?", sub: "Reservan, no vienen, y no pagaron nada" },
    outro: { title: "Que reserven solos", subtitle: "Un mes gratis. Sin tarjeta.", cta: "temppo.uy" },
    async run(ui) {
      await ui.pause(500);
      await ui.tap(ui.option("Pádel"));
      await ui.tap(ui.option("1 h 30"));
      await ui.tap(ui.optionAt(1));
      await ui.pause(400);
      await ui.scroll(300);

      ui.beat("Cada horario,", "con su precio");
      const slots = ui.page.locator("section .grid button");
      await ui.tap(slots.nth(Math.min(20, (await slots.count()) - 1)));
      await ui.pause(600);
      await ui.scroll(340);
      await ui.fill('input[autocomplete="name"]', "Joaquín Ferrés");
      await ui.fill('input[autocomplete="tel"]', "099 456 789");
      await ui.tap(ui.page.locator("section button").last(), { settle: 2600 });

      ui.beat("Queda retenida", "hasta que pague la seña");
      await ui.pause(1100);

      ui.beat("Y en el club", "entra sola");
      await ui.offstage(async () => {
        await ui.page.goto(`${BASE}/es/login`, { waitUntil: "networkidle" });
        await ui.page.fill('input[name="identifier"]', "dueno@clubdeleste.uy");
        await ui.page.fill('input[name="secret"]', "padel1234");
        await ui.page.click('button[type="submit"]');
        await ui.page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 });
        await ui.page.goto(`${BASE}/es/rentals`, { waitUntil: "networkidle" });
        await ui.page.waitForTimeout(1200);
        await ui.page.mouse.move(VW / 2, VH * 0.5);
      });
      await ui.pause(800);
      await ui.scroll(420);
      await ui.pause(900);

      ui.beat("Tus precios", "y tus horarios");
      await ui.offstage(async () => {
        await ui.page.goto(`${BASE}/es/spaces`, { waitUntil: "networkidle" });
        await ui.page.waitForTimeout(1200);
        await ui.page.mouse.move(VW / 2, VH * 0.45);
      });
      await ui.pause(900);
      await ui.scroll(320);
      await ui.pause(900);
    },
  },

  /** «Mientras dormís»: the same booking, at an hour the club is shut. */
  dormis: {
    key: "dormis",
    name: "temppo-mientras-dormis",
    start: "/es/r/club-del-este",
    hook: { line1: "Mientras dormís,", line2: "reservan igual", sub: "Tu agenda no cierra a las 20:00" },
    outro: { title: "Que reserven solos", subtitle: "Un mes gratis. Sin tarjeta.", cta: "temppo.uy" },
    async run(ui) {
      ui.beat("23:40, un martes");
      await ui.pause(500);
      await ui.tap(ui.option("Pádel"));
      await ui.tap(ui.option("1 h 30"));
      await ui.tap(ui.optionAt(1));
      await ui.pause(400);
      await ui.scroll(280);

      ui.beat("Elige la hora", "que le queda bien");
      const slots = ui.page.locator("section .grid button");
      await ui.tap(slots.nth(Math.min(14, (await slots.count()) - 1)));
      await ui.pause(600);
      await ui.scroll(340);

      ui.beat("Sin llamar,", "sin crear una cuenta");
      await ui.fill('input[autocomplete="name"]', "Joaquín Ferrés");
      await ui.fill('input[autocomplete="tel"]', "099 456 789");
      await ui.tap(ui.page.locator("section button").last(), { settle: 2600 });

      ui.beat("A la mañana", "ya está cargado");
      await ui.pause(1500);
    },
  },

  /** «De Instagram a tu agenda»: the path, ending on the club's own screen. */
  instagram: {
    key: "instagram",
    name: "temppo-de-instagram",
    start: "/es/r/club-del-este",
    hook: { line1: "Te encuentran", line2: "en Instagram", sub: "y reservan desde el link de tu bio" },
    outro: { title: "Tu link de reservas", subtitle: "Un mes gratis. Sin tarjeta.", cta: "temppo.uy" },
    async run(ui) {
      ui.beat("Tocan tu link");
      await ui.pause(500);
      await ui.tap(ui.option("Pádel"));
      await ui.tap(ui.option("1 h 30"));
      await ui.pause(400);

      ui.beat("Ven qué día", "y a qué hora hay lugar");
      await ui.tap(ui.optionAt(1));
      await ui.pause(500);
      await ui.scroll(320);
      const slots = ui.page.locator("section .grid button");
      await ui.tap(slots.nth(Math.min(18, (await slots.count()) - 1)));
      await ui.pause(600);
      await ui.scroll(340);
      await ui.fill('input[autocomplete="name"]', "Joaquín Ferrés");
      await ui.fill('input[autocomplete="tel"]', "099 456 789");
      await ui.tap(ui.page.locator("section button").last(), { settle: 2600 });

      ui.beat("Y entra sola", "en tu agenda");
      await ui.offstage(async () => {
        await ui.page.goto(`${BASE}/es/login`, { waitUntil: "networkidle" });
        await ui.page.fill('input[name="identifier"]', "dueno@clubdeleste.uy");
        await ui.page.fill('input[name="secret"]', "padel1234");
        await ui.page.click('button[type="submit"]');
        /*
          Waited on the URL, not on the network. Signing in is a server action
          that redirects, and `networkidle` resolved on the login page itself —
          so the next hop to /rentals was made while still signed out, bounced
          straight back, and the film ended on the sign-in form.
        */
        await ui.page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 });
        await ui.page.goto(`${BASE}/es/rentals`, { waitUntil: "networkidle" });
        await ui.page.waitForTimeout(1200);
        await ui.page.mouse.move(VW / 2, VH * 0.5);
      });
      await ui.pause(900);
      await ui.scroll(420);
      await ui.pause(1100);
    },
  },
};

const key = process.argv[2];
const cut = CUTS[key];
if (!cut) {
  console.error(`Elegí un corte: ${Object.keys(CUTS).join(", ")}`);
  process.exit(1);
}

await build(cut, await record(cut));
