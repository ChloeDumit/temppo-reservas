/**
 * Two finished reels about what the app does on its own, built from the
 * recordings record.mjs made (marketing/video/raw) plus drawn screens.
 *
 *   node marketing/video/compose-reels.mjs [whatsapp|mientras-dormis|tenes-lugar|un-dia|sena]
 *   RAW=/path/to/raw node marketing/video/compose-reels.mjs
 *
 * Output: marketing/video/out/temppo-beauty-<name>.mp4, 1080×1920 at 30 fps.
 */
import path from "node:path";
import { HERE, MSG, NIGHT_CHATS, OUT, WHEN, pages, probe, createStudio } from "./lib.mjs";

const { work: WORK, png, screenPng, still, recording, join, onPhone, close } = await createStudio(path.join(HERE, "work", "reels"));
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

/** A reel from screen clips, each with its caption, closed by the call to action. */
async function scripted(name, kicker, parts, outroTitle) {
  const screen = path.join(WORK, `${name}-screen.mp4`);
  const starts = join(parts.map((p) => p.clip), screen, 0.3);
  const phone = await onPhone(name, screen, kicker, parts.map((p, i) => ({ t: starts[i], text: p.text })));
  const outro = path.join(WORK, `${name}-outro.mp4`);
  still(await png(pages.outro(outroTitle), path.join(WORK, `${name}-outro.png`), { transparent: false }), 3.4, outro);
  const out = path.join(OUT, `temppo-beauty-${name}.mp4`);
  join([phone, outro], out, 0.45);
  console.log(`${path.basename(out)}  ${probe(out).toFixed(1)} s`);
}

const LOCK_MORNING = [
  { ago: "23:47", title: "Nueva reserva — Semipermanente", body: `Carolina reservó Semipermanente con Lucía: ${WHEN}. Seña: 450 UYU.` },
  { ago: "22:15", title: "Nueva reserva — Kapping", body: "Martina reservó Kapping con Lucía: martes, 27 de octubre, 15:30." },
];

/* ----------------------------------------- guion 1: ¿tenés lugar? (no intro: the hook is the chats) */
if (!only || only === "tenes-lugar") {
  const chats = await sequence(
    "tl-chats",
    NIGHT_CHATS.map((_, i, all) => ({ html: pages.chatList(all.slice(all.length - 1 - i)), s: i === all.length - 1 ? 2.2 : 0.6 })),
  );
  const booking = recording("reserva", 6.2, 14.6, 1.5, path.join(WORK, "tl-booking.mp4"));
  const wa = await sequence("tl-wa", [
    { html: pages.whatsapp([{ day: "Hoy" }, MSG.held]), s: 2.2 },
    { html: pages.whatsapp([{ day: "Hoy" }, MSG.held, MSG.confirmed, { day: "Domingo" }, MSG.reminder]), s: 3.2 },
  ]);
  const lock = await sequence("tl-lock", [{ html: pages.lockscreen(LOCK_MORNING), s: 3 }]);
  await scripted("tenes-lugar", "¿Te pasa?", [
    { clip: chats, text: "23:47 y siguen llegando “¿tenés lugar?”" },
    { clip: booking, text: "Ahora tienen mi link y reservan solas" },
    { clip: wa, text: "Y les llega todo por WhatsApp" },
    { clip: lock, text: "Yo me entero cuando ya está todo hecho" },
  ], "Dejá de responder <em>“¿tenés lugar?”</em>");
}

/* ------------------------------------------------------ guion 2: un día con mi agenda */
if (!only || only === "un-dia") {
  await scripted("un-dia", "Un día con mi agenda", [
    { clip: recording("agenda", 0.3, 6.5, 1.15, path.join(WORK, "ud-inicio.mp4")), text: "8:30 · abro la agenda" },
    { clip: recording("agenda", 8.2, 12.0, 1.0, path.join(WORK, "ud-dia.mp4")), text: "Ya sé quién viene hoy" },
    { clip: await sequence("ud-lock", [{ html: pages.lockscreen(LOCK_MORNING), s: 3 }]), text: "Entraron reservas. Con seña." },
    { clip: recording("agenda", 16.1, 18.4, 0.9, path.join(WORK, "ud-mes.mp4")), text: "Y el mes se va llenando solo" },
  ], "Tu agenda, <em>abierta las 24 horas</em>");
}

/* ------------------------------------------------------ guion 3: no me pagaron la seña */
if (!only || only === "sena") {
  const expired = await sequence("se-wa", [
    { html: pages.whatsapp([{ day: "Hoy" }, MSG.held]), s: 1.4 },
    { html: pages.whatsapp([{ day: "Hoy" }, MSG.held, MSG.expired]), s: 3.4 },
  ]);
  const taken = await sequence("se-lock", [
    {
      html: pages.lockscreen([
        { ago: "00:20", title: "Nueva reserva — Semipermanente", body: `Martina reservó Semipermanente con Lucía: ${WHEN}. Seña: 450 UYU.` },
      ]),
      s: 3,
    },
  ]);
  await scripted("sena", "La seña", [
    { clip: recording("reserva", 19.1, 24.5, 1.0, path.join(WORK, "se-pending.mp4")), text: "Reservó… y no pagó la seña 🙄" },
    { clip: expired, text: "Si no llega a tiempo, el horario se libera solo" },
    { clip: taken, text: "…y lo toma otra clienta" },
    { clip: recording("senas", 5.0, 12.4, 1.2, path.join(WORK, "se-config.mp4")), text: "Vos decidís cuánto se cobra de seña" },
  ], "Señas <em>sin perseguir a nadie</em>");
}

await close();
