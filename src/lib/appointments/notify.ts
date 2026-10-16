import "server-only";
import { db } from "@/lib/db";
import { notify, notifyOwners, notifyPreferred } from "@/lib/notifications";
import { recordAudit } from "@/lib/audit";
import { formatMoney } from "@/lib/money";
import { localePath } from "@/i18n/routing";
import { appUrlFor } from "@/lib/brand/url";
import { confirmationText, whenText } from "./whatsapp-text";
import type { SettleOutcome } from "./payments";

export function manageUrlFor(studio: { brand: string; locale: string }, token: string) {
  return `${appUrlFor(studio)}${localePath(studio.locale, `/m/${token}`)}`;
}

async function load(appointmentId: string) {
  return db.appointment.findUnique({
    where: { id: appointmentId },
    include: { studio: true, client: { include: { user: true } }, staff: true },
  });
}

/**
 * A new booking: the client gets her link to change or cancel (the only time
 * the raw token exists), the studio hears about it, and so does the
 * professional if she is not the one running the place.
 */
export async function notifyBooked(appointmentId: string, manageToken: string) {
  const appt = await load(appointmentId);
  if (!appt) return;
  const { studio } = appt;
  const client = appt.client.user;
  const manageUrl = manageUrlFor(studio, manageToken);
  const when = whenText(appt.startsAt, studio);
  const en = studio.locale === "en";

  if (client.email) {
    const pending = appt.status === "PENDING_PAYMENT";
    await notify({
      studioId: studio.id,
      to: client.email,
      template: "appointment_booked",
      subject: `${studio.name} — ${appt.serviceName}`,
      body: pending
        ? en
          ? `Hi ${client.name}, we're holding ${when} for your ${appt.serviceName}. It is confirmed once the deposit arrives.\n\nYour booking: ${manageUrl}`
          : `Hola ${client.name}, te guardamos el ${when} para tu ${appt.serviceName}. Queda confirmado cuando llegue la seña.\n\nTu reserva: ${manageUrl}`
        : confirmationText(appt, studio, client.name, manageUrl),
      relatedType: "Appointment",
      relatedId: appt.id,
    });
  }

  const staffLine = en
    ? `${client.name} booked ${appt.serviceName} with ${appt.staff.name}: ${when}.`
    : `${client.name} reservó ${appt.serviceName} con ${appt.staff.name}: ${when}.`;
  const body = `${staffLine}${appt.depositCents ? `\n${en ? "Deposit" : "Seña"}: ${formatMoney(appt.depositCents, studio.currency, studio.locale)}${appt.status === "PENDING_PAYMENT" ? (en ? " (pending)" : " (pendiente)") : ""}` : ""}${client.phone ? `\nTel: ${client.phone}` : ""}`;

  await notifyOwners(studio.id, {
    url: "/agenda",
    template: "appointment_new",
    subject: en ? `New booking — ${appt.serviceName}` : `Nueva reserva — ${appt.serviceName}`,
    body,
    relatedType: "Appointment",
    relatedId: appt.id,
  });
  if (appt.staff.role === "INSTRUCTOR") {
    await notifyPreferred({
      studioId: studio.id,
      to: appt.staff.email,
      userId: appt.staff.id,
      url: "/agenda",
      template: "appointment_new",
      subject: en ? `New booking — ${appt.serviceName}` : `Nueva reserva — ${appt.serviceName}`,
      body,
      relatedType: "Appointment",
      relatedId: appt.id,
    });
  }
}

/** Tells the client and the studio what a deposit did. */
export async function afterDepositSettled(appointmentId: string, outcome: SettleOutcome, actorLabel: string) {
  if (outcome === "ignored" || outcome === "already_settled") return;
  const appt = await load(appointmentId);
  if (!appt) return;
  const { studio } = appt;
  const client = appt.client.user;
  const en = studio.locale === "en";
  const when = whenText(appt.startsAt, studio);
  const amount = formatMoney(appt.depositCents, studio.currency, studio.locale);

  await recordAudit({
    studioId: studio.id,
    actorLabel,
    action: `appointment.deposit_${outcome}`,
    entityType: "Appointment",
    entityId: appt.id,
    metadata: { depositCents: appt.depositCents },
  });

  if (outcome === "confirmed") {
    if (client.email) {
      await notify({
        studioId: studio.id,
        to: client.email,
        template: "appointment_confirmed",
        subject: en ? `${studio.name} — confirmed` : `${studio.name} — turno confirmado`,
        body: en
          ? `Hi ${client.name}, we received your deposit of ${amount}. Your ${appt.serviceName} is confirmed for ${when}.`
          : `Hola ${client.name}, recibimos tu seña de ${amount}. Tu ${appt.serviceName} quedó confirmado para el ${when}.`,
        relatedType: "Appointment",
        relatedId: appt.id,
      });
    }
    await notifyOwners(studio.id, {
      url: "/agenda",
      template: "appointment_deposit",
      subject: en ? `Deposit received — ${client.name}` : `Seña recibida — ${client.name}`,
      body: en
        ? `${client.name} paid ${amount} for ${appt.serviceName}, ${when}. Confirmed.`
        : `${client.name} pagó ${amount} de seña por ${appt.serviceName}, ${when}. Confirmado.`,
      relatedType: "Appointment",
      relatedId: appt.id,
    });
  }

  if (outcome === "paid_too_late") {
    await notifyOwners(studio.id, {
      url: "/agenda",
      template: "appointment_deposit_late",
      subject: en ? `Deposit to return — ${client.name}` : `Seña para devolver — ${client.name}`,
      body: en
        ? `${client.name} paid ${amount} for ${appt.serviceName} (${when}) after the slot had been released, and it is now taken. Get in touch to rebook or return the money.${client.phone ? `\nTel: ${client.phone}` : ""}`
        : `${client.name} pagó ${amount} de seña por ${appt.serviceName} (${when}) después de que se liberó el horario, y ya lo tomó otra persona. Escribile para darle otro turno o devolverle la plata.${client.phone ? `\nTel: ${client.phone}` : ""}`,
      relatedType: "Appointment",
      relatedId: appt.id,
    });
  }
}
