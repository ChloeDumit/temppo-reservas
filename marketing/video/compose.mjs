/**
 * Turns the recordings from record.mjs into finished, branded videos:
 * the app inside a phone on the brand's blush, a caption above for each step,
 * the wordmark below, an opening card and a closing call to action.
 *
 *   node marketing/video/compose.mjs
 *
 * Output: marketing/video/out/*.mp4 — 1080×1920 (9:16) for WhatsApp, stories
 * and reels — one per feature, plus one that runs them all back to back.
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, "raw");
const WORK = path.join(HERE, "work");
const OUT = path.join(HERE, "out");
const MASCOT = pathToFileURL(path.join(HERE, "../mascot/mascota-b-calendario.svg")).href;
const W = 1080;
const H = 1920;
const FPS = 30;
// The phone screen: the recording's 390×844 aspect, centred.
const SW = 560;
const SH = 1212;
const SX = (W - SW) / 2;
const SY = 470;
const BEZEL = 18;

const VIDEOS = [
  { name: "reserva", title: "Así reservan tus clientas", kicker: "En un minuto, desde tu link" },
  { name: "agenda", title: "Tu día, ordenado", kicker: "Inicio, agenda y cada turno" },
  { name: "senas", title: "Señas sin perseguir a nadie", kicker: "Mercado Pago o transferencia" },
  { name: "volver", title: "Tu mejor clienta es la que vuelve", kicker: "Te avisa a quién invitar" },
];

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });

const ffmpeg = (args) => execFileSync("ffmpeg", ["-y", "-v", "error", ...args], { stdio: "inherit" });
const probe = (file) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString());
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/* ------------------------------------------------------------ the artwork */
const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;1,500&family=Jost:wght@400;500;600&family=Fredoka:wght@500&display=swap" rel="stylesheet">`;
const BASE_CSS = `*{margin:0;padding:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;background:transparent;overflow:hidden}
  body{font-family:Jost,sans-serif;color:#2a1219;font-feature-settings:"lnum" 1}
  .mark{display:flex;align-items:center;gap:14px}.mark img{width:74px;height:74px}
  .mark b{font-family:Fredoka,sans-serif;font-weight:500;font-size:48px;color:#b5536f;letter-spacing:-.01em}
  .mark small{font-size:30px;color:#8d7a81;margin-left:6px}`;

const pages = {
  background: () => `<style>${BASE_CSS}
    body{background:radial-gradient(120% 70% at 50% 0%,#fbeff3 0%,#f6e6ec 45%,#f1dbe3 100%)}
    .phone{position:absolute;left:${SX - BEZEL}px;top:${SY - BEZEL}px;width:${SW + BEZEL * 2}px;height:${SH + BEZEL * 2}px;border-radius:60px;background:#2a1018;box-shadow:0 40px 90px rgba(87,30,50,.28)}
    .foot{position:absolute;left:0;right:0;bottom:70px;display:flex;justify-content:center}</style>
    <div class="phone"></div><div class="foot"><div class="mark"><img src="${MASCOT}"><span><b>temppo</b><small>Beauty</small></span></div></div>`,
  // Only the bezel: a frame with the screen cut out, laid over the recording
  // so its square corners disappear under the rounded glass.
  ring: () => {
    const ox = SX - BEZEL, oy = SY - BEZEL, ow = SW + BEZEL * 2, oh = SH + BEZEL * 2, R = 60, r = 44;
    // The outer radius stays under ~61px: any rounder and the recording's square
    // corners poke out past the frame.
    const rr = (x, y, w, h, k) => `M${x + k},${y}H${x + w - k}A${k},${k} 0 0 1 ${x + w},${y + k}V${y + h - k}A${k},${k} 0 0 1 ${x + w - k},${y + h}H${x + k}A${k},${k} 0 0 1 ${x},${y + h - k}V${y + k}A${k},${k} 0 0 1 ${x + k},${y}Z`;
    return `<style>${BASE_CSS}</style><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position:absolute;inset:0">
      <path fill="#2a1018" fill-rule="evenodd" d="${rr(ox, oy, ow, oh, R)} ${rr(SX, SY, SW, SH, r)}"/>
</svg>`;
  },
  caption: (kicker, text) => `<style>${BASE_CSS}
    .c{position:absolute;left:80px;right:80px;top:150px;height:280px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:16px}
    .k{font-size:28px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:#b5536f}
    .t{font-family:"Cormorant Garamond",serif;font-weight:600;font-size:76px;line-height:1.02;letter-spacing:-.01em;text-wrap:balance}</style>
    <div class="c"><div class="k">${esc(kicker)}</div><div class="t">${esc(text)}</div></div>`,
  intro: (title, kicker) => `<style>${BASE_CSS}
    body{background:#b5536f;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:34px;padding:0 90px}
    .m{width:420px;height:420px;filter:drop-shadow(0 30px 60px rgba(40,10,20,.35))}
    .k{font-size:30px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:#f6d3dd}
    .t{font-family:"Cormorant Garamond",serif;font-weight:600;font-size:104px;line-height:.98;text-wrap:balance}
    .mark{position:absolute;bottom:120px}.mark b{color:#fff}.mark small{color:#f6d3dd}.mark img{background:#fff;border-radius:50%;padding:6px}</style>
    <img class="m" src="${MASCOT}"><div class="k">${esc(kicker)}</div><div class="t">${esc(title)}</div>
    <div class="mark"><img src="${MASCOT}"><span><b>temppo</b><small>Beauty</small></span></div>`,
  outro: () => `<style>${BASE_CSS}
    body{background:radial-gradient(120% 70% at 50% 0%,#fbeff3 0%,#f1dbe3 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:30px;padding:0 90px}
    .m{width:340px;height:340px}
    .t{font-family:"Cormorant Garamond",serif;font-weight:600;font-size:96px;line-height:1;text-wrap:balance}
    .t em{color:#b5536f;font-weight:500}
    .cta{background:#b5536f;color:#fff;border-radius:999px;padding:28px 56px;font-size:44px;font-weight:600}
    .s{font-size:34px;color:#5e4b52}
    .mark{position:absolute;bottom:110px}</style>
    <img class="m" src="${MASCOT}"><div class="t">Tu agenda, <em>abierta las 24 horas</em></div>
    <div class="cta">beauty.temppo.uy</div><div class="s">Probala gratis un mes · sin tarjeta</div>
    <div class="mark"><img src="${MASCOT}"><span><b>temppo</b><small>Beauty</small></span></div>`,
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
async function png(html, file, transparent = true) {
  const tmp = path.join(WORK, "_page.html");
  writeFileSync(tmp, `<!doctype html><meta charset="utf-8">${FONTS}${html}`);
  await page.goto(pathToFileURL(tmp).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: file, omitBackground: transparent });
  return file;
}

const bg = await png(pages.background(), path.join(WORK, "bg.png"), false);
const ring = await png(pages.ring(), path.join(WORK, "ring.png"));
const outroPng = await png(pages.outro(), path.join(WORK, "outro.png"), false);

/* --------------------------------------------------------------- per video */
const still = (img, seconds, file) =>
  ffmpeg(["-loop", "1", "-t", String(seconds), "-i", img, "-vf", `fps=${FPS},format=yuv420p`, "-c:v", "libx264", "-crf", "18", file]);

const outro = path.join(WORK, "outro.mp4");
still(outroPng, 3.6, outro);

// `node compose.mjs agenda` builds just that one.
const only = process.argv[2];
const mains = [];
for (const v of VIDEOS.filter((x) => !only || x.name === only)) {
  const dir = path.join(RAW, v.name);
  if (!existsSync(path.join(dir, "timeline.json"))) {
    console.warn(`skip ${v.name}: not recorded`);
    continue;
  }
  const { frames, captions, duration } = JSON.parse(readFileSync(path.join(dir, "timeline.json"), "utf8"));

  // Screen: every captured frame held until the next one was taken.
  const list = frames
    .map((f, i) => `file '${path.join(dir, f.file)}'\nduration ${Math.max(0.001, ((frames[i + 1]?.t ?? duration) - f.t)).toFixed(4)}`)
    .join("\n") + `\nfile '${path.join(dir, frames.at(-1).file)}'\n`;
  const listFile = path.join(WORK, `${v.name}.txt`);
  writeFileSync(listFile, list);
  const screen = path.join(WORK, `${v.name}-screen.mp4`);
  ffmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-vf", `fps=${FPS},scale=${SW}:${SH}:flags=lanczos,format=yuv420p`, "-c:v", "libx264", "-crf", "16", screen]);
  const len = probe(screen);

  // Captions, each shown until the next one.
  const caps = [];
  for (const [i, c] of captions.entries()) {
    caps.push({ file: await png(pages.caption(v.title, c.text), path.join(WORK, `${v.name}-cap${i}.png`)), from: c.t, to: captions[i + 1]?.t ?? len + 1 });
  }
  const inputs = ["-loop", "1", "-t", String(len), "-i", bg, "-i", screen, "-loop", "1", "-t", String(len), "-i", ring];
  for (const c of caps) inputs.push("-loop", "1", "-t", String(len), "-i", c.file);
  let chain = `[0][1]overlay=${SX}:${SY}:shortest=1[a0];[a0][2]overlay=0:0[b0]`;
  let last = "b0";
  caps.forEach((c, i) => {
    chain += `;[${last}][${i + 3}]overlay=0:0:enable='between(t,${c.from.toFixed(2)},${(c.to - 0.01).toFixed(2)})'[c${i}]`;
    last = `c${i}`;
  });
  const main = path.join(WORK, `${v.name}-main.mp4`);
  ffmpeg([...inputs, "-filter_complex", `${chain};[${last}]format=yuv420p[out]`, "-map", "[out]", "-r", String(FPS), "-c:v", "libx264", "-crf", "18", main]);
  mains.push({ ...v, main, len: probe(main) });

  // Opening card, the feature, the call to action.
  const introPng = await png(pages.intro(v.title, v.kicker), path.join(WORK, `${v.name}-intro.png`), false);
  const intro = path.join(WORK, `${v.name}-intro.mp4`);
  still(introPng, 2.4, intro);
  const out = path.join(OUT, `temppo-beauty-${v.name}.mp4`);
  joinWithFades([intro, main, outro], out);
  console.log(`${path.basename(out)}  ${probe(out).toFixed(1)} s`);
}

// All four back to back, with the feature title between them.
if (!only && mains.length > 1) {
  const generalPng = await png(pages.intro("Tu agenda online, de punta a punta", "Temppo Beauty"), path.join(WORK, "general-intro.png"), false);
  const general = path.join(WORK, "general-intro.mp4");
  still(generalPng, 2.6, general);
  const parts = [general];
  for (const m of mains) {
    const card = path.join(WORK, `${m.name}-card.mp4`);
    still(path.join(WORK, `${m.name}-intro.png`), 1.6, card);
    parts.push(card, m.main);
  }
  parts.push(outro);
  const out = path.join(OUT, "temppo-beauty-demo-completo.mp4");
  joinWithFades(parts, out);
  console.log(`${path.basename(out)}  ${probe(out).toFixed(1)} s`);
}

await browser.close();

/** Cross-fades a list of clips into one. */
function joinWithFades(clips, out, fade = 0.45) {
  const lens = clips.map(probe);
  const inputs = clips.flatMap((c) => ["-i", c]);
  let chain = "";
  let prev = "[0:v]";
  let offset = 0;
  for (let i = 1; i < clips.length; i++) {
    offset += lens[i - 1] - fade;
    const label = i === clips.length - 1 ? "[v]" : `[x${i}]`;
    chain += `${prev}[${i}:v]xfade=transition=fade:duration=${fade}:offset=${offset.toFixed(3)}${label};`;
    prev = label;
  }
  ffmpeg([...inputs, "-filter_complex", chain.slice(0, -1), "-map", "[v]", "-r", String(FPS), "-c:v", "libx264", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]);
}
