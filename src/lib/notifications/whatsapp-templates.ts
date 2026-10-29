/*
  Every WhatsApp message the platform can start. Meta only lets a business
  open a conversation with a template approved in its console, so each one
  is written here once: the name and wording to submit, and the order its
  {{n}} variables are filled in. The sending code, the template script
  (scripts/whatsapp-templates.ts) and the checks all read this list, so what
  Meta approved and what we send cannot drift apart.

  All are Utility: they are about an appointment she booked. Meta rejects a
  body that starts or ends with a variable, so each one ends on fixed words.
  An emoji or two, not more: past that a message reads as promotion, and
  Meta moves promotional templates to the dearer Marketing category.
  No footer asking her to reply BAJA: Meta does not require one on Utility
  templates. The webhook still honours BAJA / ALTA whenever she sends it.
*/

export type WhatsAppTemplateKey =
  | "appointment_booked"
  | "appointment_held"
  | "appointment_confirmed"
  | "appointment_reminder"
  | "appointment_moved"
  | "appointment_cancelled"
  | "appointment_expired"
  | "appointment_deposit_late";

export type WhatsAppTemplate = {
  /**
   * Its name in Meta when that is not the key. A template Meta recategorised
   * as Marketing cannot be moved back, so it is replaced by a new name.
   */
  metaName?: string;
  /** What each {{n}} holds, in order. */
  params: string[];
  /** Shown to the studio in Ajustes: when it goes out. */
  label: { es: string; en: string };
  body: { es: string; en: string };
};

export const WHATSAPP_TEMPLATES: Record<WhatsAppTemplateKey, WhatsAppTemplate> = {
  appointment_booked: {
    params: ["first name", "service", "studio", "day and time", "manage link"],
    label: { es: "Al reservar", en: "When she books" },
    body: {
      es: "¡Hola {{1}}! ✨ Tu turno de {{2}} en {{3}} quedó reservado.\n\n📅 {{4}}\n\nSi necesitás cambiarlo o cancelarlo, entrá a {{5}} cuando quieras.",
      en: "Hi {{1}}! ✨ Your {{2}} at {{3}} is booked.\n\n📅 {{4}}\n\nIf you need to change or cancel it, go to {{5}} any time.",
    },
  },
  appointment_held: {
    // v1 read as an offer ("we're holding your slot, pay here") and Meta
    // moved it to Marketing. This one only states where the booking stands.
    metaName: "appointment_held_v2",
    params: ["first name", "service", "studio", "day and time", "manage link"],
    label: { es: "Al reservar con seña pendiente", en: "When she books and the deposit is pending" },
    body: {
      es: "Hola {{1}}, tu turno de {{2}} en {{3}} para el {{4}} está pendiente de seña ⏳\n\nSe confirma cuando recibamos la seña. En {{5}} tenés el detalle de tu reserva y los datos para pagarla.",
      en: "Hi {{1}}, your {{2}} at {{3}} on {{4}} is pending its deposit ⏳\n\nIt is confirmed once the deposit is received. At {{5}} you'll find your booking details and how to pay it.",
    },
  },
  appointment_confirmed: {
    params: ["first name", "deposit", "service", "studio", "day and time"],
    label: { es: "Cuando llega la seña", en: "When the deposit arrives" },
    body: {
      es: "¡Hola {{1}}! 💖 Recibimos tu seña de {{2}}.\n\n✅ Tu {{3}} en {{4}} quedó confirmado para el {{5}}.\n\n¡Te esperamos!",
      en: "Hi {{1}}! 💖 We received your deposit of {{2}}.\n\n✅ Your {{3}} at {{4}} is confirmed for {{5}}.\n\nSee you then!",
    },
  },
  appointment_reminder: {
    params: ["first name", "service", "studio", "day and time"],
    label: { es: "Recordatorio antes del turno", en: "Reminder before the appointment" },
    body: {
      es: "Hola {{1}} 👋 Te recordamos tu turno de {{2}} en {{3}}:\n\n📅 {{4}}\n\n¡Te esperamos! ✨",
      en: "Hi {{1}} 👋 A reminder of your {{2}} at {{3}}:\n\n📅 {{4}}\n\nSee you then! ✨",
    },
  },
  appointment_moved: {
    // v1 said "escribinos", and a reply lands on the platform's number, which
    // nobody reads. v2 gives her the studio's own WhatsApp instead.
    metaName: "appointment_moved_v2",
    params: ["first name", "service", "studio", "day and time", "professional", "studio contact"],
    label: { es: "Si el negocio mueve el turno", en: "If the business moves it" },
    body: {
      es: "Hola {{1}}, tu turno de {{2}} en {{3}} cambió de horario 🔄\n\n📅 {{4}}, con {{5}}.\n\nSi no te queda bien, escribile al negocio en {{6}} y lo coordinan. Este número solo envía avisos.",
      en: "Hi {{1}}, your {{2}} at {{3}} has a new time 🔄\n\n📅 {{4}}, with {{5}}.\n\nIf that doesn't suit you, message the business at {{6}} to sort it out. This number only sends notices.",
    },
  },
  appointment_cancelled: {
    // v1 said "escribinos": see appointment_moved.
    metaName: "appointment_cancelled_v2",
    params: ["first name", "service", "studio", "day and time", "studio contact"],
    label: { es: "Si el negocio lo cancela", en: "If the business cancels it" },
    body: {
      es: "Hola {{1}}, se canceló tu turno de {{2}} en {{3}} del {{4}} 😔\n\nPara coordinar otro horario, escribile al negocio en {{5}} 💬 Este número solo envía avisos.",
      en: "Hi {{1}}, your {{2}} at {{3}} on {{4}} was cancelled 😔\n\nTo arrange another time, message the business at {{5}} 💬 This number only sends notices.",
    },
  },
  appointment_expired: {
    // v1 invited her to book again, which Meta counts as Marketing. This one
    // only reports what happened to the booking she made.
    metaName: "appointment_expired_v2",
    params: ["first name", "service", "studio", "day and time"],
    label: { es: "Si la seña no llega a tiempo", en: "If the deposit doesn't arrive in time" },
    body: {
      es: "Hola {{1}}, tu reserva de {{2}} en {{3}} para el {{4}} se canceló porque la seña no llegó a tiempo ⌛\n\nEl horario quedó liberado y no se hizo ningún cobro.",
      en: "Hi {{1}}, your booking for {{2}} at {{3}} on {{4}} was cancelled because the deposit didn't arrive in time ⌛\n\nThe slot has been released and nothing was charged.",
    },
  },
  appointment_deposit_late: {
    params: ["first name", "deposit", "service", "day and time", "studio"],
    label: { es: "Si la seña llega tarde y el horario ya no está", en: "If the deposit arrives after the slot was taken" },
    body: {
      es: "Hola {{1}}, tu seña de {{2}} para {{3}} ({{4}}) llegó después de que se liberó el horario, y lo reservó otra persona 😕\n\n{{5}} se va a comunicar con vos para darte otro horario o devolverte la plata 💬",
      en: "Hi {{1}}, your deposit of {{2}} for {{3}} ({{4}}) arrived after the slot was released, and someone else booked it 😕\n\n{{5}} will get in touch to give you another time or return your money 💬",
    },
  },
};

export const WHATSAPP_TEMPLATE_KEYS = Object.keys(WHATSAPP_TEMPLATES) as WhatsAppTemplateKey[];

/** The name to send and to look up in Meta. */
export function metaTemplateName(key: WhatsAppTemplateKey) {
  return WHATSAPP_TEMPLATES[key].metaName ?? key;
}

/**
 * Words that make Meta read a template as promotion and bill it as
 * Marketing. Checked by scripts/verify-whatsapp-notices.ts.
 */
export const PROMOTIONAL_WORDS = [
  "oferta", "descuento", "promo", "gratis", "regalo", "aprovech", "reservá de nuevo", "volvé", "no te pierdas", "%",
  "offer", "discount", "free", "gift", "book again", "don't miss", "come back",
];

/** The template's wording with its variables filled in, as she will read it. */
export function renderWhatsAppTemplate(key: WhatsAppTemplateKey, language: string, params: string[]) {
  const body = WHATSAPP_TEMPLATES[key].body[language === "en" ? "en" : "es"];
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? "");
}
