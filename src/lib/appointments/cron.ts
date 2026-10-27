import "server-only";
import { db } from "@/lib/db";
import { notify, notifyOwners, notifyPreferred } from "@/lib/notifications";
import { notifyWhatsApp } from "@/lib/notifications/whatsapp";
import { appUrlFor } from "@/lib/brand/url";
import { localePath } from "@/i18n/routing";
import { rebookText, reminderText, waLink, whenText } from "./whatsapp-text";
import { voidAnnouncedTransfers } from "./book";

/*
  The appointment side of the 15-minute sweep. Each job has its own guard
  column, so running more often than needed is harmless.
*/

type CronStudio = {
  id: string;
  name: string;
  slug: string;
  brand: string;
  timezone: string;
  locale: string;
  reminderHoursBefore: number;
  waMode: string;
};

const DAY = 86_400_000;

/**
 * Unpaid holds that ran out give their time back. A payment still in flight
 * is left alone: if it lands, the deposit code takes the time back when it
 * is still free, and flags a refund when it is not.
 */
export async function expireHolds(studio: CronStudio, now: Date) {
  const stale = await db.appointment.findMany({
    where: { studioId: studio.id, status: "PENDING_PAYMENT", holdExpiresAt: { lte: now } },
    include: { client: { include: { user: true } } },
  });
  if (!stale.length) return 0;

  await db.appointment.updateMany({
    where: { id: { in: stale.map((a) => a.id) }, status: "PENDING_PAYMENT" },
    data: { status: "EXPIRED", depositStatus: "NONE" },
  });
  await voidAnnouncedTransfers(db, stale.map((a) => a.id), "Turno vencido");

  const bookingUrl = `${appUrlFor(studio)}${localePath(studio.locale, `/b/${studio.slug}`)}`;
  for (const appt of stale) {
    const client = appt.client.user;
    if (!client.email) continue;
    await notify({
      studioId: studio.id,
      to: client.email,
      template: "appointment_expired",
      subject: studio.locale === "en" ? `${studio.name} — time released` : `${studio.name} — se liberó el horario`,
      body:
        studio.locale === "en"
          ? `Hi ${client.name}, the deposit for ${appt.serviceName} on ${whenText(appt.startsAt, studio)} didn't arrive in time, so the slot was released. You can book again here: ${bookingUrl}`
          : `Hola ${client.name}, no nos llegó la seña de ${appt.serviceName} del ${whenText(appt.startsAt, studio)} a tiempo, así que se liberó el horario. Podés reservar de nuevo acá: ${bookingUrl}`,
      relatedType: "Appointment",
      relatedId: appt.id,
    });
  }
  return stale.length;
}

/** How long after an appointment ends it is taken as done if nobody marked it. */
const AUTO_COMPLETE_AFTER_MS = 6 * 3_600_000;

/**
 * Confirmed appointments that ended hours ago and that nobody closed are
 * taken as done. Rebook nudges, "te toca volver", the month's numbers and
 * each client's last visit all hang on that, and a professional with clients
 * waiting does not stop to tap "Vino". A no-show stays a manual call.
 */
export async function closePastAppointments(studio: CronStudio, now: Date) {
  const done = await db.appointment.findMany({
    where: { studioId: studio.id, status: "CONFIRMED", endsAt: { lte: new Date(now.getTime() - AUTO_COMPLETE_AFTER_MS) } },
    select: { id: true, clientId: true, startsAt: true },
  });
  if (!done.length) return 0;

  await db.appointment.updateMany({
    where: { id: { in: done.map((a) => a.id) }, status: "CONFIRMED" },
    data: { status: "COMPLETED" },
  });

  const lastByClient = new Map<string, Date>();
  for (const a of done) {
    const seen = lastByClient.get(a.clientId);
    if (!seen || seen < a.startsAt) lastByClient.set(a.clientId, a.startsAt);
  }
  for (const [clientId, startsAt] of lastByClient) {
    await db.studentProfile.updateMany({
      where: { id: clientId, OR: [{ lastVisitAt: null }, { lastVisitAt: { lt: startsAt } }] },
      data: { lastVisitAt: startsAt },
    });
  }
  return done.length;
}

/**
 * The reminder before each confirmed appointment, by email and push, and by
 * automatic WhatsApp when the studio has it.
 */
export async function sendAppointmentReminders(studio: CronStudio, now: Date) {
  const windowEnd = new Date(now.getTime() + studio.reminderHoursBefore * 3_600_000);
  const due = await db.appointment.findMany({
    where: {
      studioId: studio.id,
      status: "CONFIRMED",
      remindersSentAt: null,
      startsAt: { gt: now, lte: windowEnd },
    },
    include: { client: { include: { user: true } } },
    // Soonest first, so when the WhatsApp quota runs short it is the
    // appointments still days away that miss out.
    orderBy: { startsAt: "asc" },
  });

  for (const appt of due) {
    const client = appt.client.user;
    await notifyPreferred({
      studioId: studio.id,
      to: client.email,
      userId: client.id,
      url: "/appointments",
      template: "appointment_reminder",
      subject: `${studio.name} — ${appt.serviceName}`,
      body: reminderText(appt, studio, client.name),
      relatedType: "Appointment",
      relatedId: appt.id,
    });
    if (studio.waMode === "CLOUD") {
      // Template "appointment_reminder", approved in Meta's console with
      // {{1}} first name, {{2}} service, {{3}} studio, {{4}} day and time.
      await notifyWhatsApp({
        studioId: studio.id,
        phone: client.phone,
        template: "appointment_reminder",
        language: studio.locale,
        params: [client.name.split(" ")[0], appt.serviceName, studio.name, whenText(appt.startsAt, studio)],
        relatedType: "Appointment",
        relatedId: appt.id,
        now,
      });
    }
    // Marked even when she has no email or device: staff still have the
    // WhatsApp button, and the job should not keep reconsidering her.
    await db.appointment.update({ where: { id: appt.id }, data: { remindersSentAt: now } });
  }
  return due.length;
}

/**
 * "Te toca volver": a client whose service has a rebooking cycle and who has
 * not booked again by the time it comes round. She gets an email if she has
 * one; whoever runs the studio gets the list with a WhatsApp link for each,
 * because most clients only ever gave a phone.
 *
 * Only nudges inside a fortnight of the date, so switching the feature on
 * does not message everyone who ever came.
 */
export async function sendRebookNudges(studio: CronStudio, now: Date) {
  const candidates = await db.appointment.findMany({
    where: {
      studioId: studio.id,
      status: "COMPLETED",
      rebookNudgedAt: null,
      service: { rebookAfterDays: { not: null } },
      startsAt: { gt: new Date(now.getTime() - 400 * DAY) },
    },
    include: { service: true, client: { include: { user: true } } },
    orderBy: { startsAt: "desc" },
  });

  const due = candidates.filter((a) => {
    const at = a.startsAt.getTime() + a.service!.rebookAfterDays! * DAY;
    return at <= now.getTime() && at > now.getTime() - 14 * DAY;
  });
  if (!due.length) return 0;

  // One nudge per client and service, about her latest visit — and none if
  // she already has something booked.
  const seen = new Set<string>();
  const nudge: typeof due = [];
  for (const appt of due) {
    const key = `${appt.clientId}:${appt.serviceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const [later, booked] = await Promise.all([
      // A later visit that actually happened, or is still on: a cancelled or
      // expired booking does not mean she came back.
      db.appointment.count({
        where: {
          clientId: appt.clientId,
          serviceId: appt.serviceId,
          startsAt: { gt: appt.startsAt },
          id: { not: appt.id },
          status: { in: ["COMPLETED", "CONFIRMED", "PENDING_PAYMENT"] },
        },
      }),
      db.appointment.count({ where: { clientId: appt.clientId, startsAt: { gt: now }, status: { in: ["CONFIRMED", "PENDING_PAYMENT"] } } }),
    ]);
    if (!later && !booked) nudge.push(appt);
  }

  await db.appointment.updateMany({ where: { id: { in: due.map((a) => a.id) } }, data: { rebookNudgedAt: now } });
  if (!nudge.length) return 0;

  const bookingUrl = `${appUrlFor(studio)}${localePath(studio.locale, `/b/${studio.slug}`)}`;
  const lines: string[] = [];
  for (const appt of nudge) {
    const client = appt.client.user;
    const text = rebookText(appt.serviceName, studio, client.name, bookingUrl);
    if (client.email) {
      await notify({
        studioId: studio.id,
        to: client.email,
        template: "appointment_rebook",
        subject: studio.locale === "en" ? `${studio.name} — time for your next visit?` : `${studio.name} — ¿reservamos el próximo?`,
        body: text,
        relatedType: "Appointment",
        relatedId: appt.id,
      });
    }
    const link = waLink(client.phone, text);
    lines.push(`• ${client.name} — ${appt.serviceName}${link ? `\n  ${link}` : ""}`);
  }

  await notifyOwners(studio.id, {
    url: "/clients",
    template: "appointment_rebook_digest",
    subject:
      studio.locale === "en"
        ? `${nudge.length} client(s) due to come back`
        : `${nudge.length === 1 ? "1 clienta para invitar" : `${nudge.length} clientas para invitar`} a volver`,
    body:
      (studio.locale === "en"
        ? "These clients are due for their next visit and haven't booked. Tap to send a WhatsApp from your phone:\n\n"
        : "A estas clientas ya les toca volver y no reservaron. Tocá para mandarles un WhatsApp desde tu celular:\n\n") +
      lines.join("\n"),
    relatedType: "Studio",
    relatedId: studio.id,
  });

  return nudge.length;
}
