/*
  Every WhatsApp message the platform can start. Meta only lets a business
  open a conversation with a template approved in its console, so each one
  is written here once: the name and wording to submit, and the order its
  {{n}} variables are filled in. The sending code, the template script
  (scripts/whatsapp-templates.ts) and the checks all read this list, so what
  Meta approved and what we send cannot drift apart.

  All are Utility: they are about an appointment she booked. Meta rejects a
  body that starts or ends with a variable, so each one ends on fixed words.
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
      es: "¡Hola {{1}}! Tu turno de {{2}} en {{3}} quedó para el {{4}}. Si necesitás cambiarlo o cancelarlo, entrá a {{5}} cuando quieras.",
      en: "Hi {{1}}! Your {{2}} at {{3}} is booked for {{4}}. If you need to change or cancel it, go to {{5}} any time.",
    },
  },
  appointment_held: {
    params: ["first name", "day and time", "service", "studio", "manage link"],
    label: { es: "Al reservar con seña pendiente", en: "When she books and the deposit is pending" },
    body: {
      es: "Hola {{1}}, te guardamos el {{2}} para tu {{3}} en {{4}}. Queda confirmado cuando llegue la seña: la podés pagar en {{5}} y te avisamos.",
      en: "Hi {{1}}, we're holding {{2}} for your {{3}} at {{4}}. It is confirmed once the deposit arrives: you can pay it at {{5}} and we'll let you know.",
    },
  },
  appointment_confirmed: {
    params: ["first name", "deposit", "service", "studio", "day and time"],
    label: { es: "Cuando llega la seña", en: "When the deposit arrives" },
    body: {
      es: "Hola {{1}}, recibimos tu seña de {{2}}. Tu {{3}} en {{4}} quedó confirmado para el {{5}}. ¡Te esperamos!",
      en: "Hi {{1}}, we received your deposit of {{2}}. Your {{3}} at {{4}} is confirmed for {{5}}. See you then!",
    },
  },
  appointment_reminder: {
    params: ["first name", "service", "studio", "day and time"],
    label: { es: "Recordatorio antes del turno", en: "Reminder before the appointment" },
    body: {
      es: "Hola {{1}}, te recordamos tu turno de {{2}} en {{3}}: {{4}}. ¡Te esperamos!",
      en: "Hi {{1}}, a reminder of your {{2}} at {{3}}: {{4}}. See you then!",
    },
  },
  appointment_moved: {
    params: ["first name", "service", "studio", "day and time", "professional"],
    label: { es: "Si el negocio mueve el turno", en: "If the business moves it" },
    body: {
      es: "Hola {{1}}, tu turno de {{2}} en {{3}} pasó al {{4}}, con {{5}}. Si no te queda bien, escribinos.",
      en: "Hi {{1}}, your {{2}} at {{3}} was moved to {{4}}, with {{5}}. If that doesn't suit you, message us.",
    },
  },
  appointment_cancelled: {
    params: ["first name", "service", "studio", "day and time"],
    label: { es: "Si el negocio lo cancela", en: "If the business cancels it" },
    body: {
      es: "Hola {{1}}, se canceló tu turno de {{2}} en {{3}} del {{4}}. Escribinos y te buscamos otro horario.",
      en: "Hi {{1}}, your {{2}} at {{3}} on {{4}} was cancelled. Message us and we'll find you another time.",
    },
  },
  appointment_expired: {
    params: ["first name", "service", "studio", "day and time", "booking link"],
    label: { es: "Si la seña no llega a tiempo", en: "If the deposit doesn't arrive in time" },
    body: {
      es: "Hola {{1}}, no nos llegó la seña de {{2}} en {{3}} del {{4}} a tiempo, así que se liberó el horario. Si querés, reservá de nuevo en {{5}} cuando quieras.",
      en: "Hi {{1}}, the deposit for {{2}} at {{3}} on {{4}} didn't arrive in time, so the slot was released. You can book again at {{5}} whenever you like.",
    },
  },
  appointment_deposit_late: {
    params: ["first name", "deposit", "service", "day and time", "studio"],
    label: { es: "Si la seña llega tarde y el horario ya no está", en: "If the deposit arrives after the slot was taken" },
    body: {
      es: "Hola {{1}}, tu seña de {{2}} para {{3}} ({{4}}) llegó después de que se liberó el horario, y lo reservó otra persona. {{5}} se va a comunicar con vos para darte otro horario o devolverte la plata.",
      en: "Hi {{1}}, your deposit of {{2}} for {{3}} ({{4}}) arrived after the slot was released, and someone else booked it. {{5}} will get in touch to give you another time or return your money.",
    },
  },
};

export const WHATSAPP_TEMPLATE_KEYS = Object.keys(WHATSAPP_TEMPLATES) as WhatsAppTemplateKey[];

/** The template's wording with its variables filled in, as she will read it. */
export function renderWhatsAppTemplate(key: WhatsAppTemplateKey, language: string, params: string[]) {
  const body = WHATSAPP_TEMPLATES[key].body[language === "en" ? "en" : "es"];
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? "");
}
