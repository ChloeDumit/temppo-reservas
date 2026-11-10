/**
 * Renders the TEMPPO Reservas text cards for Instagram.
 *
 *   npm run temppo:cards
 *
 * The plan asks for several posts that are type on a dark court rather than a
 * screen of the app: the price carousel, the six chores it takes off your
 * hands, the rubro post and the poll story. Drawn here instead of screenshot
 * from the site, because a crop of a web page carries its margins, its
 * scrollbar and whatever the viewport decided — and these have to sit beside
 * each other in a carousel.
 *
 * Same palette and the same court lines as the landing, so the feed and the
 * site read as one thing. Copy is lifted from src/messages/es.json: a price
 * or a limit that drifts from what the page says is worse than no post.
 */
import sharp from "sharp";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const OUT = "demo/temppo-cards";

// The landing's tokens, from globals.css.
const INK = "#1c1917";
const PAPER = "#faf7f4";
const ACCENT = "#e07a5f";
const MUTED = "#8a827a";

const DISPLAY = "Georgia,'Times New Roman',serif";
const SANS = "Helvetica,Arial,sans-serif";

/** Instagram's tallest feed ratio, and the full-screen story. */
const FEED = { w: 1080, h: 1350 };
const STORY = { w: 1080, h: 1920 };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The court, drawn the way the stylesheet draws it: a net across the middle,
 * a service line down the centre and the outline of the box, all faded out at
 * the top and bottom so the lines never collide with the type.
 */
function court({ w, h }) {
  const top = h * 0.19;
  const bottom = h * 0.81;
  return `
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000"/>
      <stop offset="0.22" stop-color="#fff"/>
      <stop offset="0.78" stop-color="#fff"/>
      <stop offset="1" stop-color="#000"/>
    </linearGradient>
    <mask id="courtfade"><rect width="${w}" height="${h}" fill="url(#fade)"/></mask>
  </defs>
  <g mask="url(#courtfade)">
    <line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="#ffffff" stroke-opacity="0.11" stroke-width="2"/>
    <line x1="${w / 2}" y1="${top}" x2="${w / 2}" y2="${bottom}" stroke="#ffffff" stroke-opacity="0.07" stroke-width="2"/>
    <rect x="${w * 0.11}" y="${top}" width="${w * 0.78}" height="${bottom - top}" fill="none" stroke="#ffffff" stroke-opacity="0.09" stroke-width="2"/>
  </g>`;
}

/** Lines of display type, centred as a block on `y`. */
function title(lines, { w, y, size, fill = PAPER, lead = 1.1, font = DISPLAY, weight = "bold", anchor = "middle", x = w / 2 }) {
  return lines
    .map(
      (line, i) =>
        `<text x="${x}" y="${y + i * size * lead}" text-anchor="${anchor}" font-family="${font}" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(line)}</text>`,
    )
    .join("\n");
}

const eyebrow = ({ w, text, y = 140 }) =>
  `<text x="${w / 2}" y="${y}" text-anchor="middle" font-family="${SANS}" font-size="30" font-weight="bold" letter-spacing="7" fill="${ACCENT}">${esc(text.toUpperCase())}</text>`;

const footer = ({ w, h, text = "reservas.temppo.uy" }) =>
  `<text x="${w / 2}" y="${h - 90}" text-anchor="middle" font-family="${SANS}" font-size="30" letter-spacing="2" fill="${MUTED}">${esc(text)}</text>`;

const frame = ({ w, h }, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="${INK}"/>
    ${court({ w, h })}
    ${body}
  </svg>`;

/* ------------------------------------------------------------------ cards */

/** A chore the studio stops doing. The numeral carries the series. */
function chore({ n, lines }) {
  const { w, h } = FEED;
  return frame(FEED, `
    ${eyebrow({ w, text: "Ya no es tarea tuya" })}
    <text x="${w / 2}" y="520" text-anchor="middle" font-family="${DISPLAY}" font-size="240" font-weight="bold" fill="${ACCENT}" opacity="0.9">${n}</text>
    ${title(lines, { w, y: 700, size: 76, lead: 1.22 })}
    ${footer({ w, h })}
  `);
}

/** One plan, with the three limits the site publishes for it. */
function plan({ name, price, rows }) {
  const { w, h } = FEED;
  const rowsSvg = rows
    .map(
      (row, i) =>
        `<text x="${w / 2}" y="${820 + i * 86}" text-anchor="middle" font-family="${SANS}" font-size="46" fill="${PAPER}" fill-opacity="0.82">${esc(row)}</text>`,
    )
    .join("\n");
  return frame(FEED, `
    ${eyebrow({ w, text: "Plan " + name })}
    <text x="${w / 2}" y="480" text-anchor="middle" font-family="${DISPLAY}" font-size="190" font-weight="bold" fill="${PAPER}">${esc(price)}</text>
    <text x="${w / 2}" y="560" text-anchor="middle" font-family="${SANS}" font-size="36" letter-spacing="4" fill="${MUTED}">POR MES, TODO INCLUIDO</text>
    <line x1="${w * 0.28}" y1="680" x2="${w * 0.72}" y2="680" stroke="${ACCENT}" stroke-width="3"/>
    ${rowsSvg}
    ${footer({ w, h })}
  `);
}

/** A plain statement card: eyebrow, headline, one supporting line. */
function statement({ size = FEED, eyebrowText, lines, titleSize = 86, sub, subSize = 44, y = 540 }) {
  const { w, h } = size;
  return frame(size, `
    ${eyebrow({ w, text: eyebrowText })}
    ${title(lines, { w, y, size: titleSize, lead: 1.2 })}
    ${sub ? `<text x="${w / 2}" y="${y + lines.length * titleSize * 1.2 + 70}" text-anchor="middle" font-family="${SANS}" font-size="${subSize}" fill="${PAPER}" fill-opacity="0.7">${esc(sub)}</text>` : ""}
    ${footer({ w, h })}
  `);
}

/** The three verticals, one under the other, with what each one is for. */
function rubros() {
  const { w, h } = FEED;
  const items = [
    ["Clases y cursos", "Pilates, yoga, funcional, danza"],
    ["Espacios por hora", "Canchas, salones"],
    ["Turnos uno a uno", "Cada cliente con su profesional"],
  ];
  /*
    No rules between the items: the court outline already crosses the card,
    and a second set of horizontal lines turned the three rubros into a table.
    An accent dash marks each one instead.
  */
  const block = items
    .map(([name, forWhom], i) => {
      const y = 620 + i * 220;
      return `
      <line x1="130" y1="${y - 26}" x2="${190}" y2="${y - 26}" stroke="${ACCENT}" stroke-width="5"/>
      <text x="220" y="${y}" font-family="${DISPLAY}" font-size="64" font-weight="bold" fill="${PAPER}">${esc(name)}</text>
      <text x="220" y="${y + 60}" font-family="${SANS}" font-size="38" fill="${MUTED}">${esc(forWhom)}</text>`;
    })
    .join("\n");
  return frame(FEED, `
    ${eyebrow({ w, text: "Un sistema, tres formas de usarlo" })}
    ${title(["Elegís tu rubro", "al crear la cuenta"], { w, y: 330, size: 72 })}
    ${block}
    ${footer({ w, h })}
  `);
}

/* ------------------------------------------------------------------ plan */

const CARDS = [
  // Carrusel · Lo que deja de ser tarea tuya
  ["tareas-0", statement({
    eyebrowText: "TEMPPO Reservas",
    lines: ["Seis cosas que", "dejás de hacer", "a mano"],
    titleSize: 94,
    y: 480,
    sub: "Deslizá →",
  })],
  ["tareas-1", chore({ n: 1, lines: ["Cargar los horarios", "todas las semanas"] })],
  ["tareas-2", chore({ n: 2, lines: ["Contestar", "«¿hay lugar?»"] })],
  ["tareas-3", chore({ n: 3, lines: ["Perseguir a los", "que no pagaron"] })],
  ["tareas-4", chore({ n: 4, lines: ["Sumar las horas de", "cada profe a fin de mes"] })],
  ["tareas-5", chore({ n: 5, lines: ["Mandar los", "recordatorios"] })],
  ["tareas-6", chore({ n: 6, lines: ["Pasar al papel lo que", "te llegó por WhatsApp"] })],

  // Carrusel · Cuánto sale. Limits and wording from src/messages/es.json.
  ["precios-0", statement({
    eyebrowText: "Precios",
    lines: ["Precio fijo", "por estudio"],
    titleSize: 98,
    y: 520,
    sub: "Sin costo por alumno, por reserva ni comisión.",
  })],
  ["precios-1", plan({ name: "Esencial", price: "$990", rows: ["hasta 60 alumnos", "hasta 4 espacios", "1 profesional"] })],
  ["precios-2", plan({ name: "Estudio", price: "$1.990", rows: ["hasta 250 alumnos", "hasta 10 espacios", "hasta 5 profesionales"] })],
  ["precios-3", plan({ name: "Red", price: "$3.490", rows: ["sin límite de alumnos", "sin límite de espacios", "varias sedes"] })],
  ["precios-4", statement({
    eyebrowText: "Todas las funciones, en los tres planes",
    lines: ["Primer mes gratis,", "sin tarjeta"],
    titleSize: 88,
    y: 560,
    sub: "Pagando el año, pagás 10 meses y usás 12.",
  })],

  // Post · Elegís tu rubro al crear la cuenta
  ["rubros", rubros()],

  // Story · la encuesta
  ["story-hay-lugar", statement({
    size: STORY,
    eyebrowText: "TEMPPO Reservas",
    lines: ["¿Cuántas veces", "por día respondés", "«hay lugar»?"],
    titleSize: 92,
    y: 720,
    sub: "La encuesta, acá abajo.",
  })],
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const [name, svg] of CARDS) {
  await sharp(Buffer.from(svg)).png().toFile(join(OUT, `${name}.png`));
  console.log(`  · ${name}.png`);
}

console.log(`\n${CARDS.length} placas en ${OUT}`);
