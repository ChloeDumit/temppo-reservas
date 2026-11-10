/*
  The TEMPPO Reservas content plans, in the same shape as the beauty ones, so
  the console's "Cargar plan" buttons create each post with its date and
  caption. Files are attached by hand — they live in demo/, not in the app.

  One account, two audiences: a club that rents courts and a studio that runs
  classes. The posts alternate rather than separating, because what both are
  buying is the same thing — people booking without them answering a message.
*/
import type { PlanItem } from "./plan-noviembre";

/** Clubs: padel, five-a-side, halls. */
const TAGS_CLUB =
  "#padel #padeluruguay #futbol5 #canchas #clubdepadel #reservas #montevideo #uruguay #canelones #puntadeleste";

/** Studios: classes with a timetable. */
const TAGS_ESTUDIO =
  "#pilates #yoga #pilatesuruguay #estudiodepilates #entrenamientofuncional #reservasonline #agendaonline #montevideo #uruguay";

/** What both of them are. */
const TAGS_AMBOS =
  "#reservasonline #agendaonline #gestion #emprendedoresuruguay #montevideo #uruguay #pymes";

export const PLAN_TEMPPO_1: PlanItem[] = [
  {
    title: "Reel · ¿Cuántas canchas perdés por semana?",
    kind: "REEL",
    date: "2026-11-11",
    time: "19:30",
    caption: `Reservan, no vienen, y no pagaron nada. La cancha quedó bloqueada para nadie 🎾\n\nCon TEMPPO reservan desde tu link, pagan la seña y el horario queda confirmado. Si no pagan, se libera solo.\n\nUn mes gratis, sin tarjeta 👉 link en la bio\n\n${TAGS_CLUB}`,
    notes: "Archivo: demo/temppo-canchas.mp4",
  },
  {
    title: "Carrusel · Lo que ve tu cliente al reservar",
    kind: "CAROUSEL",
    date: "2026-11-13",
    time: "19:30",
    caption: `Así reserva una cancha alguien que te encontró en Instagram 👇\n\n1️⃣ Elige qué quiere jugar\n2️⃣ Por cuánto tiempo\n3️⃣ Qué día hay lugar\n4️⃣ El horario, con su precio\n5️⃣ Confirma. Sin crear una cuenta.\n\nY vos lo ves en tu agenda, sin atender el teléfono.\n\n${TAGS_CLUB}`,
    notes:
      "Archivos, en este orden: demo/padel-stills/01-what.png, 02-duration.png, 03-day.png, 04-time.png, 05-confirm.png",
  },
  {
    title: "Post · El cupo fijo, sin planilla",
    kind: "POST",
    date: "2026-11-15",
    time: "19:30",
    caption: `María viene todos los martes a las 9. Se lo asignás una vez y su lugar queda reservado todas las semanas 📅\n\nSi avisa con tiempo tiene sus cambios del mes y recupera la clase. Si se pasa, la clase se pierde. La regla la ponés vos una vez; después la aplica el sistema, no vos por WhatsApp.\n\n${TAGS_ESTUDIO}`,
    notes: "Archivo: demo/stills/03-standing-spots.png",
  },
  {
    title: "Reel · Mientras dormís",
    kind: "REEL",
    date: "2026-11-18",
    time: "19:30",
    caption: `Mientras dormís, tu agenda sigue abierta 🌙\n\nReservan a la hora que quieren, pagan, y quedan confirmados. A la mañana lo ves todo cargado.\n\nClases, canchas o turnos. Elegís tu rubro al crear la cuenta.\n\nUn mes gratis 👉 link en la bio\n\n${TAGS_AMBOS}`,
    notes:
      "Archivo: demo/temppo-mientras-dormis.mp4 (npm run reel:dormis). Va a mano para ponerle un audio de Instagram.",
    channel: "MANUAL",
  },
  {
    title: "Post · Se liberó un lugar y se llenó solo",
    kind: "POST",
    date: "2026-11-20",
    time: "19:30",
    caption: `Alguien cancela a las 7 de la tarde. El primero de la lista de espera recibe el aviso, confirma, y la clase sale llena 🙌\n\nVos te enterás cuando mirás la agenda.\n\nEs la parte que más se nota el primer mes.\n\n${TAGS_ESTUDIO}`,
    notes: "Archivo: demo/stills/09-student-book.png",
  },
  {
    title: "Story · ¿Cuántas veces por día respondés 'hay lugar'?",
    kind: "STORY",
    date: "2026-11-21",
    time: "12:00",
    caption:
      "Encuesta: ¿cuántas veces por día respondés «¿hay lugar?» — Menos de 5 / Entre 5 y 20 / Ni los cuento 🙃",
    notes:
      "Fondo oscuro con las líneas de cancha, como la web. Poner la encuesta nativa de Instagram.",
    channel: "MANUAL",
  },
];

export const PLAN_TEMPPO_2: PlanItem[] = [
  {
    title: "Carrusel · Cuánto sale",
    kind: "CAROUSEL",
    date: "2026-11-23",
    time: "19:30",
    caption: `Precio fijo por estudio. Sin costo por alumno, sin costo por reserva, y 0% de comisión sobre lo que cobrás 💸\n\nEsencial $990 · Estudio $1.990 · Red $3.490\n\nTodas las funciones en los tres planes. Pagando el año, pagás 10 meses y usás 12.\n\nPrimer mes gratis, sin tarjeta 👉 link en la bio\n\n${TAGS_AMBOS}`,
    notes:
      "Capturas de la sección Precios de la web, una por plan. Last slide: el cierre oscuro de la landing.",
  },
  {
    title: "Post · Tu noche, cancha por cancha",
    kind: "POST",
    date: "2026-11-25",
    time: "19:30",
    caption: `La agenda de un viernes, de un vistazo 🎾\n\nCanchas a lo ancho, horas a lo alto. Tocás un hueco y cargás la reserva que te entró por teléfono. Las que entran online aparecen solas.\n\nNo se pueden superponer: es el mismo sistema.\n\n${TAGS_CLUB}`,
    notes: "Archivo: demo/padel-stills/10-agenda-evening.png",
  },
  {
    title: "Reel · La seña",
    kind: "REEL",
    date: "2026-11-27",
    time: "19:30",
    caption: `El que reserva y no viene te costó la cancha entera 🎾\n\nCon la seña, el horario queda retenido mientras la pagan. Si no pagan, vuelve a estar libre solo. Vos no perseguís a nadie.\n\nPor Mercado Pago o por transferencia con un código, para que sepas de quién es.\n\n${TAGS_CLUB}`,
    notes: "Archivo: demo/temppo-sena.mp4 (npm run reel:sena).",
  },
  {
    title: "Post · Elegís tu rubro al crear la cuenta",
    kind: "POST",
    date: "2026-11-29",
    time: "19:30",
    caption: `Un solo sistema, tres formas de usarlo 👇\n\n🧘 Clases y cursos — horario fijo, packs, lista de espera y cupos fijos\n🎾 Espacios por hora — canchas y salones, precio por franja y seña\n💅 Turnos uno a uno — cada cliente con su profesional\n\nElegís cuál al crear la cuenta, y se cambia después si te equivocaste.\n\n${TAGS_AMBOS}`,
    notes: "Captura de la sección «Elegís tu rubro» de la web.",
  },
  {
    title: "Carrusel · Lo que deja de ser tarea tuya",
    kind: "CAROUSEL",
    date: "2026-12-02",
    time: "19:30",
    caption: `Seis cosas que dejás de hacer a mano 👇\n\n📅 Cargar los horarios todas las semanas\n💬 Contestar «¿hay lugar?»\n💸 Perseguir a los que no pagaron\n📝 Sumar las horas de cada profe a fin de mes\n🔔 Mandar los recordatorios\n📲 Pasar al papel lo que te llegó por WhatsApp\n\nUn mes gratis para probarlo con lo tuyo 👉 link en la bio\n\n${TAGS_AMBOS}`,
    notes: "Seis placas de texto sobre fondo oscuro, con las líneas de cancha.",
  },
  {
    title: "Reel · De Instagram a tu agenda",
    kind: "REEL",
    date: null,
    time: "19:30",
    caption: `El camino completo: te encuentran en Instagram, tocan tu link, reservan, y aparece en tu agenda ✨\n\nSin llamadas, sin cuenta, sin que vos muevas un dedo.\n\n${TAGS_AMBOS}`,
    notes: "De respaldo, sin fecha. Archivo: demo/temppo-de-instagram.mp4 (npm run reel:instagram).",
    channel: "MANUAL",
  },
];
