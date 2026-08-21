/**
 * Renders every email template to demo/emails/ so they can be eyeballed in a
 * browser without sending anything.
 *
 *   npm run emails:preview
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";

const req = createRequire(import.meta.url);
const so = req.resolve("server-only");
req.cache[so] = { id: so, filename: so, loaded: true, exports: {} } as never;

const OUT = "demo/emails";

const ANIMA = { studioName: "Estudio Ánima", accentColor: "#E07A5F", logoUrl: null, locale: "es" };
const SOCO = { studioName: "SOCO", accentColor: "#C85C35", logoUrl: null, locale: "es" };
const ENGLISH = { studioName: "Studio Anima", accentColor: "#E07A5F", logoUrl: null, locale: "en" };

const SAMPLES = [
  {
    file: "magic-link",
    template: "magic_link",
    subject: "TEMPPO Reservas — acceso",
    body: "Hola Lucía Ferreira,\n\nEntrá con este enlace (vence en 15 minutos):\nhttps://reservas.temppo.uy/api/auth/magic?token=hNbYj5aeXNB849yrbbnB30WB9l4VuA8rL5wxJ51PYs&locale=es\n\nSi no lo pediste, ignorá este mensaje.",
    branding: ANIMA,
  },
  {
    file: "waitlist-offer",
    template: "waitlist_offer",
    subject: "Estudio Ánima — se liberó un lugar",
    body: "Hola Ana Pereyra, se liberó un lugar en Pilates Reformer (jue, 20 ago, 08:00). Confirmá en los próximos 15 minutos: https://reservas.temppo.uy/api/waitlist/claim?token=GmWCKUQRHmD9f7LtuVusaZQFBFRDpOBntdfVpm6Wty4&locale=es",
    branding: ANIMA,
  },
  {
    file: "class-reminder",
    template: "class_reminder",
    subject: "SOCO — tu clase de mañana",
    body: "Hola Valentina, te recordamos tu clase de Pilates Reformer mañana a las 08:00 con Romina.\n\nSi no podés venir, cancelá con al menos 6 horas de anticipación así el lugar queda libre para otra persona.",
    branding: SOCO,
  },
  {
    file: "payment-approved",
    template: "payment_approved",
    subject: "Estudio Ánima — pago aprobado",
    body: "Hola Gastón, aprobamos tu pago de 1800 UYU. Tu pack 4 clases / mes ya está activo.\n\nhttps://reservas.temppo.uy/es/my",
    branding: ANIMA,
  },
  {
    file: "reminder-en",
    template: "class_reminder",
    subject: "Studio Anima — your class tomorrow",
    body: "Hi Ana, a reminder about your Pilates Reformer class tomorrow at 08:00 with Sofía.\n\nIf you cannot make it, cancel at least 6 hours ahead so the spot frees up for someone else.",
    branding: ENGLISH,
  },
];

async function main() {
  const { renderEmail } = await import("../src/lib/notifications/email-template");
  mkdirSync(OUT, { recursive: true });

  const links: string[] = [];

  for (const sample of SAMPLES) {
    const html = renderEmail({
      body: sample.body,
      subject: sample.subject,
      template: sample.template,
      branding: sample.branding,
      appUrl: "https://reservas.temppo.uy",
    });
    writeFileSync(`${OUT}/${sample.file}.html`, html);
    links.push(
      `<li><a href="${sample.file}.html">${sample.file}</a> — ${sample.branding.studioName}</li>`,
    );
    console.log(`  · ${OUT}/${sample.file}.html`);
  }

  writeFileSync(
    `${OUT}/index.html`,
    `<!doctype html><meta charset="utf-8"><title>Email previews</title>
     <body style="font:16px/1.6 system-ui;padding:40px;max-width:640px;margin:auto;">
     <h1>TEMPPO Reservas — emails</h1><ul>${links.join("")}</ul></body>`,
  );

  console.log(`\n  Open ${OUT}/index.html\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
