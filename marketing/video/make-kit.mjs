/**
 * The editing kit: clean clips of the app in its phone, with no captions,
 * for assembling reels by hand in CapCut or TikTok. The space above the phone
 * is left empty for the text the editor adds. Also the cover and closing
 * cards, the mascot and the wordmark as transparent PNGs.
 *
 *   RAW=/path/to/raw node marketing/video/make-kit.mjs
 *
 * Output: marketing/kit-reels/clips/*.mp4 (1080×1920, 30 fps) and
 * marketing/kit-reels/imagenes/*.png. What to do with them is in
 * marketing/kit-reels/textos.md.
 */
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { HERE, MASCOT, MSG, NIGHT_CHATS, WHEN, createStudio, pages, probe } from "./lib.mjs";

const KIT = path.join(HERE, "..", "kit-reels");
const CLIPS = path.join(KIT, "clips");
const IMAGES = path.join(KIT, "imagenes");
for (const dir of [CLIPS, IMAGES]) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

const studio = await createStudio(path.join(HERE, "work", "kit"));
const { work: WORK, png, screenPng, still, recording, join, onPhone } = studio;

/** A screen clip, put in the phone with nothing above it, saved to the kit. */
async function kitClip(file, screen) {
  const phone = await onPhone(path.basename(file, ".mp4"), screen, "", []);
  copyFileSync(phone, path.join(CLIPS, file));
  console.log(`${file}  ${probe(phone).toFixed(1)} s`);
}

/** Drawn screens shown one after another, as one screen clip. */
async function sequence(name, steps) {
  const clips = [];
  for (const [i, st] of steps.entries()) {
    const img = await screenPng(st.html, `${name}-${i}`);
    const clip = path.join(WORK, `${name}-${i}.mp4`);
    still(img, st.s, clip);
    clips.push(clip);
  }
  if (clips.length === 1) return clips[0];
  const out = path.join(WORK, `${name}-screen.mp4`);
  join(clips, out, 0.25);
  return out;
}

/* --------------------------------------------------- recordings of the app */
await kitClip("01-reserva.mp4", recording("reserva", 0, 24.5, 1.3, path.join(WORK, "rec-reserva.mp4")));
await kitClip("02-inicio.mp4", recording("agenda", 0.3, 7.8, 1.0, path.join(WORK, "rec-inicio.mp4")));
await kitClip("03-agenda-dia.mp4", recording("agenda", 8.2, 12.0, 1.0, path.join(WORK, "rec-dia.mp4")));
await kitClip("04-agenda-semana-y-mes.mp4", recording("agenda", 12.1, 18.4, 1.0, path.join(WORK, "rec-semana.mp4")));
await kitClip("05-senas.mp4", recording("senas", 0, 12.4, 1.0, path.join(WORK, "rec-senas.mp4")));
await kitClip("06-te-toca-volver.mp4", recording("volver", 0, 15.0, 1.0, path.join(WORK, "rec-volver.mp4")));

/* ------------------------------------------------------- the client's phone */
await kitClip(
  "07-whatsapp-todos-los-mensajes.mp4",
  await sequence("wa-all", [
    { html: pages.whatsapp([{ day: "Hoy" }]), s: 0.8 },
    { html: pages.whatsapp([{ day: "Hoy" }, MSG.held]), s: 3.2 },
    { html: pages.whatsapp([{ day: "Hoy" }, MSG.held, MSG.confirmed]), s: 3.2 },
    { html: pages.whatsapp([{ day: "Hoy" }, MSG.held, MSG.confirmed, { day: "Domingo" }, MSG.reminder]), s: 3.6 },
  ]),
);
await kitClip(
  "08-whatsapp-recordatorio.mp4",
  await sequence("wa-rem", [
    { html: pages.whatsapp([{ day: "Domingo" }]), s: 0.8 },
    { html: pages.whatsapp([{ day: "Domingo" }, MSG.reminder]), s: 3.6 },
  ]),
);
await kitClip(
  "09-whatsapp-sena-vencida.mp4",
  await sequence("wa-exp", [
    { html: pages.whatsapp([{ day: "Hoy" }, MSG.held]), s: 1.6 },
    { html: pages.whatsapp([{ day: "Hoy" }, MSG.held, MSG.expired]), s: 3.6 },
  ]),
);

/* ------------------------------------------------------------ her own phone */
await kitClip(
  "10-chats-tenes-lugar.mp4",
  await sequence(
    "chats",
    // The oldest arrives first; each new chat lands on top, like WhatsApp.
    NIGHT_CHATS.map((_, i, all) => ({ html: pages.chatList(all.slice(all.length - 1 - i)), s: i === all.length - 1 ? 2.4 : 0.7 })),
  ),
);
await kitClip(
  "11-notificacion-nuevas-reservas.mp4",
  await sequence("lock", [
    {
      html: pages.lockscreen([
        { ago: "23:47", title: "Nueva reserva — Semipermanente", body: `Carolina reservó Semipermanente con Lucía: ${WHEN}. Seña: 450 UYU.` },
        { ago: "22:15", title: "Nueva reserva — Kapping", body: "Martina reservó Kapping con Lucía: martes, 27 de octubre, 15:30." },
      ]),
      s: 4,
    },
  ]),
);

/* ------------------------------------------------------- cards and artwork */
const card = async (name, html, seconds) => {
  const img = await png(html, path.join(IMAGES, `${name}.png`), { transparent: false });
  const clip = path.join(WORK, `${name}.mp4`);
  still(img, seconds, clip);
  copyFileSync(clip, path.join(CLIPS, `${name}.mp4`));
  console.log(`${name}.mp4  ${seconds} s`);
};
await card("12-portada-23-47", pages.intro("Vos ya estás <em>durmiendo.</em>", "Mientras tanto", { night: true }), 3);
await card("13-portada-whatsapp", pages.intro("Le llega solo <em>por WhatsApp</em>", "Nuevo en Temppo Beauty"), 3);
await card("14-cierre", pages.outro("Tu agenda, <em>abierta las 24 horas</em>"), 4);

const FONTS_CSS = `@import url("https://fonts.googleapis.com/css2?family=Fredoka:wght@500&family=Jost:wght@500&display=swap");`;
await png(
  `<style>html,body{margin:0;width:800px;height:800px;background:transparent}img{width:800px;height:800px}</style><img src="${MASCOT}">`,
  path.join(IMAGES, "mascota.png"),
  { width: 800, height: 800 },
);
for (const [name, color, sub] of [
  ["logo-temppo-beauty", "#b5536f", "#8d7a81"],
  ["logo-temppo-beauty-blanco", "#ffffff", "#f6d3dd"],
]) {
  await png(
    `<style>${FONTS_CSS}html,body{margin:0;width:1000px;height:300px;background:transparent;display:flex;align-items:center;justify-content:center}
      .m{display:flex;align-items:center;gap:28px}img{width:180px;height:180px}
      b{font-family:Fredoka,sans-serif;font-weight:500;font-size:130px;color:${color};letter-spacing:-.01em}
      small{font-family:Jost,sans-serif;font-weight:500;font-size:74px;color:${sub};margin-left:14px}</style>
      <div class="m"><img src="${MASCOT}"><span><b>temppo</b><small>Beauty</small></span></div>`,
    path.join(IMAGES, `${name}.png`),
    { width: 1000, height: 300 },
  );
}
console.log("imagenes: mascota, logos, portadas y cierre");

await studio.close();
