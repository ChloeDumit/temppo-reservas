/**
 * Two finished reels about what the app does on its own, built from the
 * recordings record.mjs made (marketing/video/raw) plus drawn screens.
 *
 *   node marketing/video/compose-reels.mjs [whatsapp|mientras-dormis]
 *   RAW=/path/to/raw node marketing/video/compose-reels.mjs
 *
 * Output: marketing/video/out/temppo-beauty-<name>.mp4, 1080×1920 at 30 fps.
 */
import path from "node:path";
import { HERE, MSG, OUT, WHEN, pages, probe, createStudio } from "./lib.mjs";

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

await close();
