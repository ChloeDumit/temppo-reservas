import "server-only";
import { db } from "@/lib/db";
import { notify, notifyOwners, notifyPreferred } from "@/lib/notifications";
import { recordAudit } from "@/lib/audit";
import { formatMoney } from "@/lib/money";
import { localePath } from "@/i18n/routing";
import { appUrlFor } from "@/lib/brand/url";
import { confirmationText, whenText } from "./whatsapp-text";
import type { SettleOutcome } from "./payments";

async function announcedTransfer(appointmentId: string) {
  return db.payment.findFirst({
    where: { appointmentId, method: "BANK_TRANSFER", status: "PENDING" },
    select: { shortCode: true, amountCents: true },
  });
}

/** What to do with a transfer that is on its way. */
function transferLine(code: string | null, en: boolean) {
  return en
    ? `She'll pay by transfer and send the receipt on WhatsApp with code ${code}. When you see the money, tap "Paid" under Pending deposits on your home screen, or on the appointment in the agenda.`
    : `Va a pagar por transferencia y mandarte el comprobante por WhatsApp con el código ${code}. Cuando veas la plata, tocá "Pagada" en Señas pendientes, en Inicio, o en el turno desde la Agenda.`;
}

/**
 * The client chose to pay by transfer after booking, from her link. The
 * studio hears it then, with the code to match against the receipt.
 */
export async function notifyTransferAnnounced(appointmentId: string) {
  const appt = await load(appointmentId);
  const transfer = appt && (await announcedTransfer(appt.id));
  if (!appt || !transfer) return;
  const { studio } = appt;
  const en = studio.locale === "en";
  const client = appt.client.user;
  await notifyOwners(studio.id, {
    url: "/dashboard",
    template: "appointment_transfer",
    subject: en ? `Deposit by transfer — ${client.name}` : `Seña por transferencia — ${client.name}`,
    body: `${en ? `${client.name}, ${appt.serviceName} on` : `${client.name}, ${appt.serviceName} el`} ${whenText(appt.startsAt, studio)}: ${formatMoney(transfer.amountCents, studio.currency, studio.locale)}.\n\n${transferLine(transfer.shortCode, en)}`,
    relatedType: "Appointment",
    relatedId: appt.id,
  });
}

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
 *
 * `contactEmail`: the address typed on this booking, which may not be the
 * one on her file — a public booking never writes it there (see
 * findOrCreateClient), but its confirmation still goes to whoever made it.
 */
export async function notifyBooked(appointmentId: string, manageToken: string, contactEmail?: string | null) {
  const appt = await load(appointmentId);
  if (!appt) return;
  const { studio } = appt;
  const client = { ...appt.client.user, email: contactEmail || appt.client.user.email };
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
  const transfer = appt.status === "PENDING_PAYMENT" ? await announcedTransfer(appt.id) : null;
  const deposit = appt.depositCents
    ? `\n${en ? "Deposit" : "Seña"}: ${formatMoney(appt.depositCents, studio.currency, studio.locale)}${appt.status === "PENDING_PAYMENT" ? (en ? " (pending)" : " (pendiente)") : ""}`
    : "";
  const body = `${staffLine}${deposit}${transfer ? `\n\n${transferLine(transfer.shortCode, en)}` : ""}${client.phone ? `\nTel: ${client.phone}` : ""}`;

  await notifyOwners(studio.id, {
    url: transfer ? "/dashboard" : "/agenda",
    template: "appointment_new",
    subject: transfer
      ? en
        ? `New booking, deposit by transfer — ${client.name}`
        : `Nueva reserva con seña por transferencia — ${client.name}`
      : en
        ? `New booking — ${appt.serviceName}`
        : `Nueva reserva — ${appt.serviceName}`,
    body,
    relatedType: "Appointment",
    relatedId: appt.id,
  });
  if (appt.staff.role === "INSTRUCTOR") {
    await notifyPreferred({
      studioId: studio.id,
      to: appt.staff.email,
      userId: appt.staff.id,
      inbox: true,
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
    // She paid and the time is gone: tell her before she turns up.
    if (client.email) {
      await notify({
        studioId: studio.id,
        to: client.email,
        template: "appointment_deposit_late_client",
        subject: en ? `${studio.name} — about your deposit` : `${studio.name} — sobre tu seña`,
        body: en
          ? `Hi ${client.name}, your deposit of ${amount} for ${appt.serviceName} (${when}) arrived after the time had been released, and someone else booked it. ${studio.name} will get in touch to give you another time or return your money.`
          : `Hola ${client.name}, tu seña de ${amount} para ${appt.serviceName} (${when}) llegó después de que se liberó el horario, y lo reservó otra persona. ${studio.name} se va a comunicar con vos para darte otro horario o devolverte la plata.`,
        relatedType: "Appointment",
        relatedId: appt.id,
      });
    }
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

/**
 * Someone at the studio booked a client in for another professional: she
 * should not find out by opening her agenda.
 */
export async function notifyStaffBookedForYou(appointmentId: string, byUserId: string) {
  const appt = await load(appointmentId);
  if (!appt || appt.staffId === byUserId) return;
  const { studio } = appt;
  const en = studio.locale === "en";
  await notifyPreferred({
    studioId: studio.id,
    to: appt.staff.email,
    userId: appt.staff.id,
    inbox: true,
    url: "/agenda",
    template: "appointment_new",
    subject: en ? `New appointment — ${appt.client.user.name}` : `Nuevo turno — ${appt.client.user.name}`,
    body: en
      ? `${appt.serviceName}, ${whenText(appt.startsAt, studio)}.`
      : `${appt.serviceName}, ${whenText(appt.startsAt, studio)}.`,
    relatedType: "Appointment",
    relatedId: appt.id,
  });
}

/**
 * The business moved or called off her appointment: she hears it from us,
 * not by turning up. Email when we have one; staff also get a WhatsApp
 * button in the agenda for everyone else.
 */
export async function notifyClientChanged(appointmentId: string, kind: "moved" | "cancelled") {
  const appt = await load(appointmentId);
  if (!appt?.client.user.email) return;
  const { studio } = appt;
  const client = appt.client.user;
  const when = whenText(appt.startsAt, studio);
  const en = studio.locale === "en";
  const first = client.name.split(" ")[0];
  const body =
    kind === "moved"
      ? en
        ? `Hi ${first}, your ${appt.serviceName} at ${studio.name} was moved to ${when}, with ${appt.staff.name}. If that doesn't suit you, just reply or message us.`
        : `Hola ${first}, tu turno de ${appt.serviceName} en ${studio.name} pasó al ${when}, con ${appt.staff.name}. Si no te queda bien, respondé este mail o escribinos.`
      : en
        ? `Hi ${first}, your ${appt.serviceName} at ${studio.name} on ${when} was cancelled. Message us and we'll find you another time.`
        : `Hola ${first}, se canceló tu turno de ${appt.serviceName} en ${studio.name} del ${when}. Escribinos y te buscamos otro horario.`;
  await notify({
    studioId: studio.id,
    to: client.email,
    template: kind === "moved" ? "appointment_moved" : "appointment_cancelled_by_studio",
    subject: `${studio.name} — ${appt.serviceName}`,
    body,
    relatedType: "Appointment",
    relatedId: appt.id,
  });
}

/** She cancelled — from her link or her account. The owners hear what it means for the deposit. */
export async function notifyClientCancelled(appointmentId: string, depositStatus: string) {
  const appt = await load(appointmentId);
  if (!appt) return;
  const { studio } = appt;
  const name = appt.client.user.name;
  const en = studio.locale === "en";
  const when = whenText(appt.startsAt, studio);
  const amount = formatMoney(appt.depositCents, studio.currency, studio.locale);
  // Only a deposit actually paid is kept, returned or carried over.
  const depositLine =
    depositStatus === "FORFEITED"
      ? en ? ` Late: the ${amount} deposit is kept.` : ` Fuera de término: la seña de ${amount} queda.`
      : depositStatus === "REFUNDED"
        ? en ? ` Return her ${amount} deposit.` : ` Hay que devolverle la seña de ${amount}.`
        : depositStatus === "CREDIT"
          ? en ? ` Her ${amount} deposit stays as credit for her next visit.` : ` La seña de ${amount} le queda como crédito para la próxima.`
          : "";
  await notifyOwners(studio.id, {
    url: "/agenda",
    template: "appointment_cancelled",
    subject: en ? `Cancelled — ${name}` : `Canceló — ${name}`,
    body: en
      ? `${name} cancelled ${appt.serviceName} on ${when}.${depositLine}`
      : `${name} canceló ${appt.serviceName} del ${when}.${depositLine}`,
    relatedType: "Appointment",
    relatedId: appt.id,
  });
}
