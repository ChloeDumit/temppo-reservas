import { formatTime } from "@/lib/dates";
import { whatsappLink } from "@/lib/payment-code";
import { toWhatsAppNumber } from "@/lib/phone";

/**
 * The words that go out about an appointment, shared by email, push and the
 * WhatsApp button. Written once so a reminder reads the same on every channel.
 */

type Appt = { serviceName: string; startsAt: Date };
type Studio = { name: string; timezone: string; locale: string };

export function whenText(startsAt: Date, studio: Pick<Studio, "timezone" | "locale">) {
  const day = new Intl.DateTimeFormat(studio.locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: studio.timezone,
  }).format(startsAt);
  return `${day}, ${formatTime(startsAt, studio.timezone, studio.locale)}`;
}

export function confirmationText(appt: Appt, studio: Studio, clientName: string, manageUrl?: string) {
  const when = whenText(appt.startsAt, studio);
  const first = clientName.split(" ")[0];
  if (studio.locale === "en") {
    return `Hi ${first}! Your ${appt.serviceName} at ${studio.name} is booked for ${when}.${manageUrl ? `\n\nTo change or cancel: ${manageUrl}` : ""}`;
  }
  return `¡Hola ${first}! Tu turno de ${appt.serviceName} en ${studio.name} quedó para el ${when}.${manageUrl ? `\n\nPara cambiarlo o cancelarlo: ${manageUrl}` : ""}`;
}

export function reminderText(appt: Appt, studio: Studio, clientName: string, manageUrl?: string) {
  const when = whenText(appt.startsAt, studio);
  const first = clientName.split(" ")[0];
  if (studio.locale === "en") {
    return `Hi ${first}, a reminder of your ${appt.serviceName} at ${studio.name}: ${when}. See you then!${manageUrl ? `\n\nCan't make it? ${manageUrl}` : ""}`;
  }
  return `Hola ${first}, te recordamos tu turno de ${appt.serviceName} en ${studio.name}: ${when}. ¡Te esperamos!${manageUrl ? `\n\n¿No podés venir? ${manageUrl}` : ""}`;
}

export function rebookText(serviceName: string, studio: Studio, clientName: string, bookingUrl: string) {
  const first = clientName.split(" ")[0];
  if (studio.locale === "en") {
    return `Hi ${first}! It's been a while since your ${serviceName} at ${studio.name}. Want to book the next one? ${bookingUrl}`;
  }
  return `¡Hola ${first}! Ya va siendo hora de tu próximo ${serviceName} en ${studio.name}. ¿Reservamos? ${bookingUrl}`;
}

/** Opens the professional's own WhatsApp with the message ready to send. */
export function waLink(phone: string | null | undefined, text: string) {
  const international = toWhatsAppNumber(phone);
  if (!international) return null;
  return whatsappLink(international, text);
}
