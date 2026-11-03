/**
 * Two finished reels about what the app does on its own, built from the
 * recordings record.mjs made (marketing/video/raw) plus drawn screens.
 *
 *   node marketing/video/compose-reels.mjs [whatsapp|mientras-dormis|tenes-lugar|un-dia|sena|demo|pov-cancela|antes-despues|sena-15]
 *   RAW=/path/to/raw node marketing/video/compose-reels.mjs
 *
 * Output: marketing/video/out/temppo-beauty-<name>.mp4, 1080×1920 at 30 fps.
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { HERE, MSG, NIGHT_CHATS, OUT, RAW, WHEN, pages, probe, createStudio } from "./lib.mjs";

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

/* ------------------------------------------- the full demo, to send to a business */
if (!only || only === "demo") {
  /** A stretch of a recording, with its own captions moved to the clip's time. */
  const take = (name, from, to, speed) => {
    const { captions } = JSON.parse(readFileSync(path.join(RAW, name, "timeline.json"), "utf8"));
    const clip = recording(name, from, to, speed, path.join(WORK, `demo-${name}-${from}.mp4`));
    const caps = captions
      .map((c, i) => ({ ...c, end: captions[i + 1]?.t ?? Infinity }))
      .filter((c) => c.end > from && c.t < to)
      .map((c) => ({ t: Math.max(0, (c.t - from) / speed), text: c.text }));
    return { clip, caps };
  };
  /** Several takes back to back as one screen, captions and all. */
  const joined = (name, takes) => {
    if (takes.length === 1) return takes[0];
    const screen = path.join(WORK, `demo-${name}-screen.mp4`);
    const starts = join(takes.map((t) => t.clip), screen, 0.3);
    return { clip: screen, caps: takes.flatMap((t, i) => t.caps.map((c) => ({ t: c.t + starts[i], text: c.text }))) };
  };

  // The messages match the booking the Mercado Pago take ends on.
  const DEMO_WHEN = "lunes, 9 de noviembre, 10:00";
  const say = (m) => ({ ...m, html: m.html.replaceAll(WHEN, DEMO_WHEN).replaceAll("450 UYU", "360 UYU") });
  const wa = await sequence("demo-wa", [
    { html: pages.whatsapp([{ day: "Hoy" }, say(MSG.held)]), s: 2.6 },
    { html: pages.whatsapp([{ day: "Hoy" }, say(MSG.held), say(MSG.confirmed)]), s: 2.8 },
    { html: pages.whatsapp([{ day: "Hoy" }, say(MSG.held), say(MSG.confirmed), { day: "Domingo" }, say(MSG.reminder)]), s: 3.4 },
  ]);
  const lock = await sequence("demo-lock", [
    {
      html: pages.lockscreen(
        [
          { ago: "23:47", title: "Nueva reserva — Semipermanente", body: `Carolina reservó Semipermanente con Lucía: ${DEMO_WHEN}. Seña: 360 UYU.` },
          { ago: "22:15", title: "Nueva reserva — Kapping", body: "Martina reservó Kapping con Lucía: martes, 10 de noviembre, 15:30." },
        ],
        "domingo 8 de noviembre",
      ),
      s: 3.4,
    },
  ]);

  const sections = [
    { kicker: "1 · Reservas", title: "Así reservan <em>tus clientas</em>", ...joined("res", [take("reserva", 0, 14.6, 1.25)]) },
    {
      kicker: "2 · Señas",
      title: "La seña, con <em>Mercado Pago</em>",
      ...joined("mp", [take("mercadopago", 7.0, 11.2, 1.0), take("mercadopago", 12.3, 19.0, 1.0)]),
    },
    { kicker: "3 · Tu Mercado Pago", title: "La plata, <em>directo a tu cuenta</em>", ...joined("mpn", [take("mercadopago-negocio", 0, 7.6, 1.0)]) },
    {
      kicker: "4 · WhatsApp",
      title: "Le llega todo <em>por WhatsApp</em>",
      clip: wa,
      caps: [
        { t: 0, text: "Al reservar, con su link" },
        { t: 2.35, text: "Cuando paga la seña" },
        { t: 4.9, text: "Y el recordatorio, antes del turno" },
      ],
    },
    { kicker: "5 · Agenda", title: "Tu día, <em>ordenado</em>", ...joined("ag", [take("agenda", 0.3, 18.4, 1.3)]) },
    { kicker: "6 · Transferencias", title: "Señas <em>sin perseguir a nadie</em>", ...joined("se", [take("senas", 0, 18.0, 1.3)]) },
    { kicker: "7 · Clientas", title: "Tu mejor clienta <em>es la que vuelve</em>", ...joined("vo", [take("volver", 0, 15.0, 1.2)]) },
    { kicker: "8 · Avisos", title: "Y te enterás <em>de cada reserva</em>", clip: lock, caps: [{ t: 0, text: "Cada reserva nueva, en tu celular" }] },
  ];

  const parts = [];
  const opening = path.join(WORK, "demo-opening.mp4");
  still(await png(pages.intro("Tu agenda online, <em>de punta a punta</em>", "Temppo Beauty"), path.join(WORK, "demo-opening.png"), { transparent: false }), 2.8, opening);
  parts.push(opening);
  for (const [i, sec] of sections.entries()) {
    const card = path.join(WORK, `demo-card-${i}.mp4`);
    still(await png(pages.intro(sec.title, sec.kicker), path.join(WORK, `demo-card-${i}.png`), { transparent: false }), 1.7, card);
    parts.push(card, await onPhone(`demo-s${i}`, sec.clip, sec.kicker.replace(/^\d+ · /, ""), sec.caps));
  }
  const outro = path.join(WORK, "demo-outro.mp4");
  still(await png(pages.outro("Probala <em>gratis un mes</em>"), path.join(WORK, "demo-outro.png"), { transparent: false }), 4, outro);
  parts.push(outro);
  const out = path.join(OUT, "temppo-beauty-demo.mp4");
  join(parts, out, 0.4);
  console.log(`${path.basename(out)}  ${probe(out).toFixed(1)} s`);
}

/* ------------------------------------------------- late November: three more */

/** A stretch of a recording at the phone's size, with no captions of its own. */
const clipOf = (name, from, to, speed = 1) => recording(name, from, to, speed, path.join(WORK, `n2-${name}-${from}-${to}.mp4`));

if (!only || only === "pov-cancela") {
  const VALE = { name: "Vale", color: "#c97b93", status: "en línea" };
  const yesterday = { out: true, time: "18:02", html: "¡Te espero mañana a las 10! 💅" };
  const chat = await sequence("pov-chat", [
    { html: pages.whatsapp([{ day: "Ayer" }, yesterday], VALE, "9:50"), s: 1.3 },
    { html: pages.whatsapp([{ day: "Ayer" }, yesterday, { day: "Hoy" }, { time: "9:50", html: "holaa perdón no llego 😅" }], VALE, "9:50"), s: 1.5 },
    {
      html: pages.whatsapp([{ day: "Ayer" }, yesterday, { day: "Hoy" }, { time: "9:50", html: "holaa perdón no llego 😅" }, { time: "9:50", html: "lo pasamos?" }], VALE, "9:50"),
      s: 2.4,
    },
  ]);
  await scripted("pov-cancela", "POV", [
    { clip: chat, text: "Son las 9:50 y tenías turno a las 10:00" },
    { clip: clipOf("mercadopago", 12.3, 17.8, 1.0), text: "Con seña, esto deja de doler" },
    { clip: clipOf("agenda", 8.2, 12.0, 1.0), text: "Y el horario lo puede tomar otra" },
  ], "Con seña, <em>sin sustos</em>");
}

if (!only || only === "antes-despues") {
  const chats = await sequence(
    "ad-chats",
    NIGHT_CHATS.map((_, i, all) => ({ html: pages.chatList(all.slice(all.length - 1 - i)), s: i === all.length - 1 ? 1.8 : 0.45 })),
  );
  const lock = await sequence("ad-lock", [
    {
      html: pages.lockscreen(
        [
          { ago: "23:47", title: "Nueva reserva — Semipermanente", body: "Carolina reservó Semipermanente con Lucía: lunes, 23 de noviembre, 10:00. Seña: 360 UYU." },
          { ago: "22:15", title: "Nueva reserva — Kapping", body: "Martina reservó Kapping con Lucía: martes, 24 de noviembre, 15:30." },
        ],
        "domingo 22 de noviembre",
      ),
      s: 2.6,
    },
  ]);
  await scripted("antes-despues", "Antes / después", [
    { clip: chats, text: "Antes: 23:47 y 6 chats sin responder" },
    { clip: clipOf("agenda", 8.2, 12.0, 1.0), text: "Después: la agenda se llena sola" },
    { clip: lock, text: "Y te avisa de cada reserva" },
  ], "Tu agenda, <em>abierta las 24 horas</em>");
}

if (!only || only === "sena-15") {
  // The messages match the booking the Mercado Pago take ends on.
  const DATE = "lunes, 9 de noviembre, 10:00";
  const paid = { ...MSG.confirmed, html: MSG.confirmed.html.replaceAll(WHEN, DATE).replaceAll("450 UYU", "360 UYU") };
  const wa = await sequence("s15-wa", [
    { html: pages.whatsapp([{ day: "Hoy" }]), s: 0.6 },
    { html: pages.whatsapp([{ day: "Hoy" }, paid]), s: 2.8 },
  ]);
  await scripted("sena-15", "La seña", [
    { clip: clipOf("reserva", 11.4, 14.6, 1.3), text: "¿Tus clientas van a querer pagar seña?" },
    { clip: clipOf("mercadopago", 7.0, 11.2, 1.1), text: "Es un paso más al reservar: Mercado Pago o transferencia" },
    { clip: clipOf("mercadopago", 12.3, 16.5, 1.0), text: "Y el turno queda confirmado" },
    { clip: wa, text: "Con su aviso por WhatsApp" },
  ], "Señas <em>sin perseguir a nadie</em>");
}

await close();
