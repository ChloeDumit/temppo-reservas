/**
 * Two reels about what the app does on its own, built from the recordings
 * record.mjs made (marketing/video/raw) plus screens drawn here: the client's
 * WhatsApp chat and the owner's lock screen.
 *
 *   node marketing/video/compose-reels.mjs [whatsapp|mientras-dormis]
 *   RAW=/path/to/raw node marketing/video/compose-reels.mjs
 *
 * Output: marketing/video/out/temppo-beauty-<name>.mp4, 1080×1920 at 30 fps.
 *
 * The WhatsApp messages are the approved templates, word for word, filled in
 * with the booking the recording makes (Carolina, Semipermanente, Lu Nails
 * Studio, Monday 26 October at 10:00, a 450 UYU deposit by transfer).
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = process.env.RAW || path.join(HERE, "raw");
const WORK = path.join(HERE, "work", "reels");
const OUT = path.join(HERE, "out");
const MASCOT = pathToFileURL(path.join(HERE, "../mascot/mascota-b-calendario.svg")).href;
const W = 1080;
const H = 1920;
const FPS = 30;
const SW = 560;
const SH = 1212;
const SX = (W - SW) / 2;
const SY = 470;
const BEZEL = 18;

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });

const ffmpeg = (args) => execFileSync("ffmpeg", ["-y", "-v", "error", ...args], { stdio: "inherit" });
const probe = (file) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString());
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/* ------------------------------------------------------------ the artwork */
const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;1,500&family=Jost:wght@400;500;600&family=Fredoka:wght@500&display=swap" rel="stylesheet">`;
const EMOJI = `"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji"`;
const BASE_CSS = `*{margin:0;padding:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;background:transparent;overflow:hidden}
  body{font-family:Jost,${EMOJI},sans-serif;color:#2a1219;font-feature-settings:"lnum" 1}
  .mark{display:flex;align-items:center;gap:14px}.mark img{width:74px;height:74px}
  .mark b{font-family:Fredoka,sans-serif;font-weight:500;font-size:48px;color:#b5536f;letter-spacing:-.01em}
  .mark small{font-size:30px;color:#8d7a81;margin-left:6px}`;
const MARK = `<div class="mark"><img src="${MASCOT}"><span><b>temppo</b><small>Beauty</small></span></div>`;

const pages = {
  background: () => `<style>${BASE_CSS}
    body{background:radial-gradient(120% 70% at 50% 0%,#fbeff3 0%,#f6e6ec 45%,#f1dbe3 100%)}
    .phone{position:absolute;left:${SX - BEZEL}px;top:${SY - BEZEL}px;width:${SW + BEZEL * 2}px;height:${SH + BEZEL * 2}px;border-radius:60px;background:#2a1018;box-shadow:0 40px 90px rgba(87,30,50,.28)}
    .foot{position:absolute;left:0;right:0;bottom:70px;display:flex;justify-content:center}</style>
    <div class="phone"></div><div class="foot">${MARK}</div>`,
  ring: () => {
    const ox = SX - BEZEL, oy = SY - BEZEL, ow = SW + BEZEL * 2, oh = SH + BEZEL * 2, R = 60, r = 44;
    const rr = (x, y, w, h, k) => `M${x + k},${y}H${x + w - k}A${k},${k} 0 0 1 ${x + w},${y + k}V${y + h - k}A${k},${k} 0 0 1 ${x + w - k},${y + h}H${x + k}A${k},${k} 0 0 1 ${x},${y + h - k}V${y + k}A${k},${k} 0 0 1 ${x + k},${y}Z`;
    return `<style>${BASE_CSS}</style><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position:absolute;inset:0">
      <path fill="#2a1018" fill-rule="evenodd" d="${rr(ox, oy, ow, oh, R)} ${rr(SX, SY, SW, SH, r)}"/></svg>`;
  },
  caption: (kicker, text) => `<style>${BASE_CSS}
    .c{position:absolute;left:80px;right:80px;top:150px;height:280px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:16px}
    .k{font-size:28px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:#b5536f}
    .t{font-family:"Cormorant Garamond",serif;font-weight:600;font-size:76px;line-height:1.02;letter-spacing:-.01em;text-wrap:balance}</style>
    <div class="c"><div class="k">${esc(kicker)}</div><div class="t">${esc(text)}</div></div>`,
  intro: (title, kicker, { night = false } = {}) => `<style>${BASE_CSS}
    body{background:${night ? "radial-gradient(110% 70% at 50% 20%,#4a1d2c 0%,#2a1018 70%)" : "#b5536f"};color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:34px;padding:0 90px}
    .m{width:380px;height:380px;filter:drop-shadow(0 30px 60px rgba(20,5,10,.45))}
    .k{font-size:30px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:#f6d3dd}
    .t{font-family:"Cormorant Garamond",serif;font-weight:600;font-size:104px;line-height:.98;text-wrap:balance}
    .t em{font-style:italic;font-weight:500;color:#f3b8c8}
    .clock{font-family:"Cormorant Garamond",serif;font-weight:600;font-size:260px;line-height:.9;letter-spacing:-.02em;color:#fff}
    .moon{font-size:120px}
    .mark{position:absolute;bottom:120px}.mark b{color:#fff}.mark small{color:#f6d3dd}.mark img{background:#fff;border-radius:50%;padding:6px}</style>
    ${night ? `<div class="moon">🌙</div><div class="clock">23:47</div>` : `<img class="m" src="${MASCOT}">`}
    <div class="k">${esc(kicker)}</div><div class="t">${title}</div>${MARK}`,
  outro: (title) => `<style>${BASE_CSS}
    body{background:radial-gradient(120% 70% at 50% 0%,#fbeff3 0%,#f1dbe3 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:30px;padding:0 90px}
    .m{width:340px;height:340px}
    .t{font-family:"Cormorant Garamond",serif;font-weight:600;font-size:96px;line-height:1;text-wrap:balance}
    .t em{color:#b5536f;font-weight:500}
    .cta{background:#b5536f;color:#fff;border-radius:999px;padding:28px 56px;font-size:44px;font-weight:600}
    .s{font-size:34px;color:#5e4b52}
    .mark{position:absolute;bottom:110px}</style>
    <img class="m" src="${MASCOT}"><div class="t">${title}</div>
    <div class="cta">beauty.temppo.uy</div><div class="s">Probala gratis un mes · sin tarjeta</div>${MARK}`,

  /** The client's WhatsApp, at the phone screen's size. */
  whatsapp: (bubbles) => `<style>*{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${SW}px;height:${SH}px;overflow:hidden}
    body{font-family:-apple-system,"Helvetica Neue",${EMOJI},sans-serif;background:#efeae2;display:flex;flex-direction:column}
    .status .icons{display:flex;gap:6px;align-items:center}.status{height:44px;background:#f6f6f6;display:flex;align-items:center;justify-content:space-between;padding:0 28px;font-size:16px;font-weight:600;color:#111}
    .bar{background:#f6f6f6;border-bottom:1px solid #ddd;display:flex;align-items:center;gap:12px;padding:10px 16px 12px}
    .back{color:#0a7cff;font-size:30px;line-height:1;margin-right:2px}
    .av{width:46px;height:46px;border-radius:50%;background:#fbeff3;display:grid;place-items:center;overflow:hidden}.av img{width:40px;height:40px}
    .who b{display:flex;align-items:center;gap:6px;font-size:18px;color:#111}.who small{font-size:13px;color:#777}
    .tick{width:16px;height:16px;border-radius:50%;background:#25d366;display:inline-grid;place-items:center}
    .chat{flex:1;display:flex;flex-direction:column;justify-content:flex-end;gap:10px;padding:16px 14px 18px;overflow:hidden;
      background-image:radial-gradient(rgba(0,0,0,.035) 1.2px,transparent 1.3px);background-size:18px 18px}
    .day{align-self:center;background:#fff;color:#555;font-size:13px;padding:5px 12px;border-radius:8px;box-shadow:0 1px .5px rgba(0,0,0,.12)}
    .b{align-self:flex-start;max-width:86%;background:#fff;border-radius:0 14px 14px 14px;padding:9px 12px 6px;font-size:17px;line-height:1.38;color:#111;box-shadow:0 1px .5px rgba(0,0,0,.13);white-space:pre-line}
    .b a{color:#027eb5}.b time{display:block;text-align:right;font-size:12px;color:#8a8a8a;margin-top:2px}
    .input{height:64px;background:#f6f6f6;display:flex;align-items:center;gap:10px;padding:0 14px}
    .input span{flex:1;height:38px;border-radius:20px;background:#fff;border:1px solid #e2e2e2}</style>
    <div class="status"><span>9:41</span><span class="icons"><svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="#111"/><rect x="5" y="5" width="3" height="7" rx="1" fill="#111"/><rect x="10" y="2" width="3" height="10" rx="1" fill="#111"/><rect x="15" y="0" width="3" height="12" rx="1" fill="#111"/></svg><svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="#111" opacity=".4"/><rect x="2" y="2" width="18" height="9" rx="2" fill="#111"/><rect x="24.5" y="4" width="2" height="5" rx="1" fill="#111" opacity=".4"/></svg></span></div>
    <div class="bar"><span class="back">‹</span><span class="av"><img src="${MASCOT}"></span>
      <span class="who"><b>Temppo <span class="tick"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg></span></b><small>Cuenta de empresa</small></span></div>
    <div class="chat">${bubbles
      .map((b) => (b.day ? `<div class="day">${esc(b.day)}</div>` : `<div class="b">${b.html}<time>${b.time}</time></div>`))
      .join("")}</div>
    <div class="input"><span></span></div>`,

  /** The owner's phone in the morning, with the booking's notification. */
  lockscreen: (notes) => `<style>*{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${SW}px;height:${SH}px;overflow:hidden}
    body{font-family:-apple-system,"Helvetica Neue",Jost,${EMOJI},sans-serif;color:#fff;
      background:radial-gradient(120% 80% at 30% 10%,#e7a9bb 0%,#b5536f 40%,#5a2234 100%);display:flex;flex-direction:column;align-items:center}
    .date{margin-top:110px;font-size:22px;font-weight:500;opacity:.9}
    .time{font-size:120px;font-weight:300;letter-spacing:-.02em;line-height:1.05}
    .stack{margin-top:auto;margin-bottom:120px;width:100%;padding:0 16px;display:flex;flex-direction:column;gap:10px}
    .n{background:rgba(255,255,255,.86);backdrop-filter:blur(20px);color:#111;border-radius:26px;padding:18px 20px;display:flex;gap:14px}
    .n img{width:56px;height:56px;border-radius:13px;background:#fbeff3;padding:4px}
    .n .h{display:flex;justify-content:space-between;font-size:17px;color:#555}.n b{display:block;font-size:21px;margin-top:3px}
    .n p{font-size:20px;line-height:1.35;margin-top:3px;color:#222}</style>
    <div class="date">domingo 25 de octubre</div><div class="time">7:30</div>
    <div class="stack">${notes
      .map((n) => `<div class="n"><img src="${MASCOT}"><div style="flex:1"><div class="h"><span>TEMPPO BEAUTY</span><span>${n.ago}</span></div><b>${esc(n.title)}</b><p>${esc(n.body)}</p></div></div>`)
      .join("")}</div>`,
};

/* ---------------------------------------------------- the messages she gets */
const WHEN = "lunes, 26 de octubre, 10:00";
const MSG = {
  held: {
    time: "23:47",
    html: `Hola Carolina, tu turno de Semipermanente en Lu Nails Studio para el ${WHEN} está pendiente de seña ⏳\n\nSe confirma cuando recibamos la seña. En <a>beauty.temppo.uy/m/…</a> tenés el detalle de tu reserva y los datos para pagarla.`,
  },
  confirmed: {
    time: "23:52",
    html: `¡Hola Carolina! 💖 Recibimos tu seña de 450 UYU.\n\n✅ Tu Semipermanente en Lu Nails Studio quedó confirmado para el ${WHEN}.\n\n¡Te esperamos!`,
  },
  reminder: {
    time: "10:00",
    html: `Hola Carolina 👋 Te recordamos tu turno de Semipermanente en Lu Nails Studio:\n\n📅 ${WHEN}\n\n¡Te esperamos! ✨`,
  },
};

/* ------------------------------------------------------------------ helpers */
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
async function png(html, file, { transparent = true, width = W, height = H } = {}) {
  await page.setViewportSize({ width, height });
  const tmp = path.join(WORK, "_page.html");
  writeFileSync(tmp, `<!doctype html><meta charset="utf-8">${FONTS}${html}`);
  await page.goto(pathToFileURL(tmp).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: file, omitBackground: transparent });
  return file;
}
const screenPng = (html, name) => png(html, path.join(WORK, `${name}.png`), { transparent: false, width: SW, height: SH });

const still = (img, seconds, file, size) =>
  ffmpeg(["-loop", "1", "-t", String(seconds), "-i", img, "-vf", `fps=${FPS},${size ? `scale=${size}:flags=lanczos,` : ""}format=yuv420p`, "-c:v", "libx264", "-crf", "16", file]);

/** A stretch of a raw recording, sped up, at the phone screen's size. */
function recording(name, from, to, speed, file) {
  const dir = path.join(RAW, name);
  const { frames, duration } = JSON.parse(readFileSync(path.join(dir, "timeline.json"), "utf8"));
  const pick = frames.map((f, i) => ({ ...f, end: frames[i + 1]?.t ?? duration })).filter((f) => f.end > from && f.t < to);
  const list =
    pick.map((f) => `file '${path.join(dir, f.file)}'\nduration ${Math.max(0.001, (Math.min(f.end, to) - Math.max(f.t, from)) / speed).toFixed(4)}`).join("\n") +
    `\nfile '${path.join(dir, pick.at(-1).file)}'\n`;
  const listFile = `${file}.txt`;
  writeFileSync(listFile, list);
  ffmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-vf", `fps=${FPS},scale=${SW}:${SH}:flags=lanczos,format=yuv420p`, "-c:v", "libx264", "-crf", "16", file]);
  return file;
}

/** Cross-fades clips into one. */
function join(clips, out, fade = 0.35) {
  const lens = clips.map(probe);
  const inputs = clips.flatMap((c) => ["-i", c]);
  let chain = "";
  let prev = "[0:v]";
  let offset = 0;
  const starts = [0];
  for (let i = 1; i < clips.length; i++) {
    offset += lens[i - 1] - fade;
    starts.push(offset);
    const label = i === clips.length - 1 ? "[v]" : `[x${i}]`;
    chain += `${prev}[${i}:v]xfade=transition=fade:duration=${fade}:offset=${offset.toFixed(3)}${label};`;
    prev = label;
  }
  ffmpeg([...inputs, "-filter_complex", chain.slice(0, -1), "-map", "[v]", "-r", String(FPS), "-c:v", "libx264", "-crf", "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]);
  return starts;
}

/** The phone on the blush background, with timed captions above it. */
async function onPhone(name, screen, kicker, captions) {
  const len = probe(screen);
  const caps = [];
  for (const [i, c] of captions.entries()) {
    caps.push({ file: await png(pages.caption(kicker, c.text), path.join(WORK, `${name}-cap${i}.png`)), from: c.t, to: captions[i + 1]?.t ?? len + 1 });
  }
  const inputs = ["-loop", "1", "-t", String(len), "-i", bg, "-i", screen, "-loop", "1", "-t", String(len), "-i", ring];
  for (const c of caps) inputs.push("-loop", "1", "-t", String(len), "-i", c.file);
  let chain = `[0][1]overlay=${SX}:${SY}:shortest=1[a0];[a0][2]overlay=0:0[b0]`;
  let last = "b0";
  caps.forEach((c, i) => {
    chain += `;[${last}][${i + 3}]overlay=0:0:enable='between(t,${c.from.toFixed(2)},${(c.to - 0.01).toFixed(2)})'[c${i}]`;
    last = `c${i}`;
  });
  const out = path.join(WORK, `${name}-phone.mp4`);
  ffmpeg([...inputs, "-filter_complex", `${chain};[${last}]format=yuv420p[out]`, "-map", "[out]", "-r", String(FPS), "-c:v", "libx264", "-crf", "17", out]);
  return out;
}

const bg = await png(pages.background(), path.join(WORK, "bg.png"), { transparent: false });
const ring = await png(pages.ring(), path.join(WORK, "ring.png"));
const only = process.argv[2];

/* ------------------------------------------------ reel 1: le llega por WhatsApp */
if (!only || only === "whatsapp") {
  const booking = recording("reserva", 6.2, 22.4, 1.55, path.join(WORK, "wa-booking.mp4"));
  const steps = [
    { name: "wa0", bubbles: [{ day: "Hoy" }], s: 0.9 },
    { name: "wa1", bubbles: [{ day: "Hoy" }, MSG.held], s: 3.2 },
    { name: "wa2", bubbles: [{ day: "Hoy" }, MSG.held, MSG.confirmed], s: 3.2 },
    { name: "wa3", bubbles: [{ day: "Hoy" }, MSG.held, MSG.confirmed, { day: "Domingo" }, MSG.reminder], s: 3.6 },
  ];
  const stills = [];
  for (const st of steps) {
    const img = await screenPng(pages.whatsapp(st.bubbles), st.name);
    const clip = path.join(WORK, `${st.name}.mp4`);
    still(img, st.s, clip);
    stills.push(clip);
  }
  const screen = path.join(WORK, "wa-screen.mp4");
  const starts = join([booking, ...stills], screen, 0.3);
  const phone = await onPhone("wa", screen, "WhatsApp automático", [
    { t: 0, text: "Tu clienta reserva desde tu link" },
    { t: starts[1], text: "Y le llega todo por WhatsApp" },
    { t: starts[2], text: "Al reservar, con su link" },
    { t: starts[3], text: "Cuando paga la seña" },
    { t: starts[4], text: "Y el recordatorio, antes del turno" },
  ]);
  const intro = path.join(WORK, "wa-intro.mp4");
  still(await png(pages.intro("Le llega solo <em>por WhatsApp</em>", "Nuevo en Temppo Beauty"), path.join(WORK, "wa-intro.png"), { transparent: false }), 2.4, intro);
  const outro = path.join(WORK, "wa-outro.mp4");
  still(await png(pages.outro("Sin que vos <em>mandes nada</em>"), path.join(WORK, "wa-outro.png"), { transparent: false }), 3.4, outro);
  const out = path.join(OUT, "temppo-beauty-whatsapp.mp4");
  join([intro, phone, outro], out, 0.45);
  console.log(`${path.basename(out)}  ${probe(out).toFixed(1)} s`);
}

/* ------------------------------------------------ reel 2: mientras dormís */
if (!only || only === "mientras-dormis") {
  const booking = recording("reserva", 9.1, 22.4, 1.6, path.join(WORK, "md-booking.mp4"));
  const lock = await screenPng(
    pages.lockscreen([
      { ago: "23:47", title: "Nueva reserva — Semipermanente", body: `Carolina reservó Semipermanente con Lucía: ${WHEN}. Seña: 450 UYU.` },
      { ago: "22:15", title: "Nueva reserva — Kapping", body: "Martina reservó Kapping con Lucía: martes, 27 de octubre, 15:30." },
    ]),
    "md-lock",
  );
  const lockClip = path.join(WORK, "md-lock.mp4");
  still(lock, 3.4, lockClip);
  const agenda = recording("agenda", 8.2, 12.0, 1.0, path.join(WORK, "md-agenda.mp4"));
  const screen = path.join(WORK, "md-screen.mp4");
  const starts = join([booking, lockClip, agenda], screen, 0.3);
  const phone = await onPhone("md", screen, "Tu agenda, abierta las 24 horas", [
    { t: 0, text: "Ella elige día, hora y deja la seña" },
    { t: starts[1], text: "A la mañana, ya te avisó" },
    { t: starts[2], text: "Y tu agenda se completó sola" },
  ]);
  const intro = path.join(WORK, "md-intro.mp4");
  still(await png(pages.intro("Vos ya estás <em>durmiendo.</em>", "Mientras tanto", { night: true }), path.join(WORK, "md-intro.png"), { transparent: false }), 2.8, intro);
  const outro = path.join(WORK, "md-outro.mp4");
  still(await png(pages.outro("Tu agenda, <em>abierta las 24 horas</em>"), path.join(WORK, "md-outro.png"), { transparent: false }), 3.4, outro);
  const out = path.join(OUT, "temppo-beauty-mientras-dormis.mp4");
  join([intro, phone, outro], out, 0.45);
  console.log(`${path.basename(out)}  ${probe(out).toFixed(1)} s`);
}

await browser.close();
if (!existsSync(OUT)) process.exit(1);
