/*
  The Temppo Beauty content plans (marketing/contenido/*.md), so the console's
  "Cargar plan" buttons create each post with its date and caption. The files
  are attached by hand: they are in marketing/ and the kit, not in the app.
*/

export type PlanItem = {
  title: string;
  kind: "POST" | "CAROUSEL" | "REEL" | "STORY";
  /** Montevideo wall time. Null: a backup, with no date of its own. */
  date: string | null;
  time: string;
  caption: string;
  /** Which file(s) to attach, and for one that goes up by hand, how. */
  notes: string;
  /** "MANUAL" for one that goes up by hand (a voice-over, an in-app audio). */
  channel?: "INSTAGRAM" | "MANUAL";
};

const TAGS_A = "#manicura #uñasuruguay #cosmetologa #pestañas #lashes #turnosonline #agendaonline #uruguay #montevideo #canelones";

export const PLAN_NOVIEMBRE: PlanItem[] = [
  {
    title: "Reel · Le llega solo por WhatsApp",
    kind: "REEL",
    date: "2026-11-02",
    time: "19:30",
    caption: `Tu clienta reserva sola desde tu link y le llega todo por WhatsApp: la confirmación al reservar y el recordatorio antes del turno. Vos no mandás nada. 📲\n\nSin apps para tus clientas, sin perseguir a nadie.\n\nProbalo gratis un mes, sin tarjeta 👉 link en la bio\n\n${TAGS_A}`,
    notes: "Archivo: marketing/video/out/temppo-beauty-whatsapp-musica.mp4",
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

/** 16–29 November 2026 (marketing/contenido/noviembre-2.md). */
export const PLAN_NOVIEMBRE_2: PlanItem[] = [
  {
    title: "Reel · POV: te cancelan 10 minutos antes",
    kind: "REEL",
    date: "2026-11-16",
    time: "19:30",
    caption:
      "POV: preparaste todo y te escriben 10 minutos antes 🫠\n\nCon seña al reservar, una cancelación de último momento deja de ser plata perdida: si cancela fuera de término, la seña queda para vos.\n\nProbalo gratis un mes, sin tarjeta 👉 link en la bio\n\n#manicura #uñasuruguay #pestañas #cosmetologa #seña #emprendedoras #humor",
    channel: "MANUAL",
    notes: [
      "A MANO, con tu voz en off. El video de acá abajo es la versión sin música (16 s).",
      "",
      "GUION (tono dramático, despacio, como contándole a una amiga):",
      "[0–5 s · aparece el chat] «Nueve y cincuenta. Todo preparado, la clienta a las diez… y me llega esto.» (pausa) «“Holaa, perdón, no llego”.»",
      "[5–10 s · la reserva con seña] «Antes me arruinaba la mañana. Ahora pido seña al reservar: si cancela tarde, la seña queda para mí.»",
      "[10–13 s · la agenda] «Y el horario queda libre para otra clienta.»",
      "[13–16 s · el cierre] «Temppo Beauty. Link en la bio.»",
      "",
      "CÓMO: Instagram → + → Reel → elegí el video → Audio → Voz en off: grabás mientras se reproduce. Bajá el volumen del video a 0 (no tiene música, pero así queda limpio). Si preferís, un audio en tendencia de «drama» de fondo, bajito. Pegá el caption con «Copiar caption».",
    ].join("\n"),
  },
  {
    title: "Carrusel · 4 mensajes para copiar y pegar",
    kind: "CAROUSEL",
    date: "2026-11-18",
    time: "19:30",
    caption:
      "Guardalo para cuando lo necesites 📌\n\n4 mensajes listos para copiar y pegar: pedir la seña, confirmar, reprogramar e invitar a volver.\n\nY si te cansaste de mandarlos a mano, Temppo Beauty los manda solos por WhatsApp. Probalo gratis un mes 👉 link en la bio\n\n#manicura #uñas #pestañas #cosmetologia #emprendedoras #tipsparaemprendedoras",
    notes: "Archivos, en este orden: carrusel-mensajes-1.png … carrusel-mensajes-6.png",
  },
  {
    title: "Reel · Antes / después",
    kind: "REEL",
    date: "2026-11-20",
    time: "19:30",
    caption:
      "Antes / después de tener tu link de reservas 📲\n\nTus clientas eligen día y hora solas, pagan la seña y les llega el recordatorio por WhatsApp. Vos solo mirás la agenda.\n\nProbala gratis un mes 👉 link en la bio\n\n#antesydespues #manicura #uñasuruguay #lashes #emprendedoras",
    channel: "MANUAL",
    notes: [
      "A MANO, con un audio en tendencia de «transformación» (de los que tienen un corte marcado). El video de acá abajo es la versión sin música (12 s).",
      "",
      "CÓMO: Instagram → + → Reel → elegí el video → Audio → buscá un audio en tendencia y mové el inicio para que el corte caiga justo cuando aparece «Después» (a los 3–4 s). Pegá el caption con «Copiar caption».",
      "",
      "OPCIONAL, voz en off (si la usás, el audio en tendencia va de fondo, bajito):",
      "[0–3 s · los chats] «Antes: once y cuarenta y siete de la noche, contestando turnos por WhatsApp.»",
      "[3–7 s · la agenda] «Después: mis clientas reservan solas y la agenda se llena.»",
      "[7–9 s · la notificación] «Y me avisa de cada reserva.»",
      "[final] «Temppo Beauty. Link en la bio.»",
      "",
      "OPCIONAL: si tenés un video tuyo trabajando (tus manos, una uña terminada), sumalo al principio del «Después». Le da mucha calidez.",
    ].join("\n"),
  },
  {
    title: "Carrusel · ¿Cuánto te cuesta una clienta que no viene?",
    kind: "CAROUSEL",
    date: "2026-11-23",
    time: "19:30",
    caption:
      "Hacé la cuenta 🧮\n\nPrecio de tu servicio × clientas que faltan por mes. Ese número es lo que dejás de cobrar todos los meses.\n\nCon seña al reservar, la que cancela tarde no te deja con las manos vacías. Probalo gratis un mes 👉 link en la bio\n\n#manicura #pestañas #cosmetologa #emprendedoras #finanzas #seña",
    notes: "Archivos, en este orden: carrusel-cuenta-1.png … carrusel-cuenta-5.png",
  },
  {
    title: "Reel · La seña, explicada en 15 segundos",
    kind: "REEL",
    date: "2026-11-25",
    time: "19:30",
    caption:
      "\"¿Y si mis clientas no quieren pagar seña?\" 🤔\n\nEs un paso más al reservar, como cuando reservás un restaurante: eligen el turno, pagan la seña con Mercado Pago o transferencia y les llega la confirmación por WhatsApp. Vos decidís cuánto cobrar en cada servicio.\n\nProbala gratis un mes 👉 link en la bio\n\n#seña #manicura #uñas #pestañas #emprendedoras #mercadopago",
    notes: "Archivo: temppo-beauty-sena-15-musica.mp4",
  },
  {
    title: "Post · Diciembre se acerca",
    kind: "POST",
    date: "2026-11-27",
    time: "19:30",
    caption:
      "Diciembre es el mes más lindo… y el de más mensajes 🎄😅\n\nArmá tu agenda online ahora, ponela en la bio y que tus clientas reserven solas antes de las fiestas: con seña y recordatorio por WhatsApp.\n\nPrimer mes gratis, sin tarjeta 👉 link en la bio\n\n#diciembre #fiestas #manicura #uñasuruguay #pestañas #emprendedoras",
    notes: "Archivo: post-diciembre.png",
  },
];

/** Every plan the console can load, newest last. */
export const CONTENT_PLANS = [
  { id: "noviembre-1", label: "Plan del 2 al 15 de noviembre", items: PLAN_NOVIEMBRE },
  { id: "noviembre-2", label: "Plan del 16 al 29 de noviembre", items: PLAN_NOVIEMBRE_2 },
];
