/*
  The Temppo Beauty plan for 2–15 November 2026 (marketing/contenido/
  noviembre.md), so "Cargar plan de noviembre" in the console creates each
  post with its date and caption. The files are attached by hand: they are in
  marketing/ and the kit, not in the app.
*/

export type PlanItem = {
  title: string;
  kind: "POST" | "CAROUSEL" | "REEL" | "STORY";
  /** Montevideo wall time. Null: a backup, with no date of its own. */
  date: string | null;
  time: string;
  caption: string;
  /** Which file(s) to attach. */
  notes: string;
};

const TAGS_A = "#manicura #uñasuruguay #cosmetologa #pestañas #lashes #turnosonline #agendaonline #uruguay #montevideo #canelones";

export const PLAN_NOVIEMBRE: PlanItem[] = [
  {
    title: "Reel · Le llega solo por WhatsApp",
    kind: "REEL",
    date: "2026-11-02",
    time: "19:30",
    caption: `Tu clienta reserva sola desde tu link y le llega todo por WhatsApp: la confirmación al reservar y el recordatorio antes del turno. Vos no mandás nada. 📲\n\nSin apps para tus clientas, sin perseguir a nadie.\n\nProbalo gratis un mes, sin tarjeta 👉 link en la bio\n\n${TAGS_A}`,
    notes: "Archivo: marketing/video/out/temppo-beauty-whatsapp.mp4",
  },
  {
    title: "Carrusel · Lo que recibe tu clienta",
    kind: "CAROUSEL",
    date: "2026-11-04",
    time: "19:30",
    caption:
      "¿Qué le llega a tu clienta cuando reserva con Temppo Beauty? 👇\n\n✨ La confirmación, con su link para cambiar o cancelar\n💖 El aviso cuando llega la seña\n📅 El recordatorio antes del turno\n\nTodo por WhatsApp y todo automático. Vos seguís atendiendo.\n\nPrimer mes gratis, con WhatsApp incluido 👉 link en la bio\n\n#manicura #uñas #cosmetologia #pestañas #turnos #whatsapp #emprendedorasuruguay",
    notes: "Archivos, en este orden: marketing/instagram/noviembre/carrusel-recibe-1.png … carrusel-recibe-5.png",
  },
  {
    title: "Reel · ¿Tenés lugar?",
    kind: "REEL",
    date: "2026-11-06",
    time: "19:30",
    caption:
      "Si respondés \"¿tenés lugar?\" 30 veces por día, esto es para vos 🙋‍♀️\n\nTus clientas reservan solas desde tu link, pagan la seña y les llega el recordatorio por WhatsApp. Vos te enterás cuando ya está todo hecho.\n\nProbalo gratis un mes 👉 link en la bio",
    notes: "Archivo: marketing/video/out/temppo-beauty-tenes-lugar.mp4",
  },
  {
    title: "Reel · Mientras dormís",
    kind: "REEL",
    date: "2026-11-09",
    time: "19:30",
    caption:
      "Mientras dormís, tu agenda sigue abierta 🌙\n\nTus clientas reservan a la hora que quieren, pagan la seña y quedan confirmadas. A la mañana lo ves todo en tu agenda.\n\nTu agenda, abierta las 24 horas 👉 link en la bio\n\n#manicura #uñasuruguay #pestañas #cosmetologa #agendaonline #emprendedoras",
    notes: "Archivo: marketing/video/out/temppo-beauty-mientras-dormis.mp4",
  },
  {
    title: "Post · El recordatorio sale solo",
    kind: "POST",
    date: "2026-11-11",
    time: "19:30",
    caption:
      "El recordatorio que antes mandabas a mano, ahora sale solo 📅\n\nLe llega a tu clienta por WhatsApp antes del turno, con el nombre de tu negocio. Si tiene que cambiarlo, lo hace sola desde su link.\n\nIncluido en el plan Equipo y en tu mes de prueba gratis 👉 link en la bio",
    notes: "Archivo: marketing/instagram/noviembre/post-recordatorio.png",
  },
  {
    title: "Reel · Un día con mi agenda",
    kind: "REEL",
    date: "2026-11-13",
    time: "19:30",
    caption:
      "Un día con mi agenda 💅\n\nAbro el celular, veo quién viene, atiendo tranquila y las reservas entran solas, con seña y recordatorio por WhatsApp.\n\n¿Querés tu agenda así? Probala gratis un mes 👉 link en la bio",
    notes: "Archivo: marketing/video/out/temppo-beauty-un-dia.mp4",
  },
  {
    title: "Carrusel · 3 cosas que tu agenda hace sola",
    kind: "CAROUSEL",
    date: null,
    time: "19:30",
    caption:
      "Mientras vos atendés, tu agenda trabaja 👇\n\n1️⃣ Toma reservas\n2️⃣ Cobra la seña\n3️⃣ Avisa por WhatsApp\n\nProbala gratis un mes, sin tarjeta 👉 link en la bio",
    notes: "De reserva. Archivos, en orden: marketing/instagram/noviembre/carrusel-sola-1.png … carrusel-sola-4.png",
  },
  {
    title: "Reel · La seña",
    kind: "REEL",
    date: null,
    time: "19:30",
    caption:
      "¿Te pasó que reservan y no pagan la seña? 🙄 Con Temppo Beauty, si la seña no llega a tiempo, el horario se libera solo y lo puede tomar otra clienta. Probala gratis un mes 👉 link en la bio",
    notes: "De reserva. Archivo: marketing/video/out/temppo-beauty-sena.mp4",
  },
];
