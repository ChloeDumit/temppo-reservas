"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { notifyOwners } from "@/lib/notifications";
import { isOnlinePaymentEnabled } from "@/lib/payments";
import { appUrlFor } from "@/lib/brand/url";
import { cancelAppointment, findByManageToken, rescheduleAppointment } from "@/lib/appointments/book";
import { startDepositCheckout, submitDepositTransfer } from "@/lib/appointments/payments";
import { manageUrlFor, notifyTransferAnnounced } from "@/lib/appointments/notify";
import { whenText } from "@/lib/appointments/whatsapp-text";

export type ManageState = { error?: string; ok?: boolean } | null;

const PAGE = "/[locale]/(public)/m/[token]";

/*
  Everything here is authorised by the token alone — the link is the key,
  exactly like the email it arrived in. Nothing else about the client is
  needed or trusted.
*/

export async function cancelByTokenAction(_prev: ManageState, formData: FormData): Promise<ManageState> {
  const token = String(formData.get("token") ?? "");
  const appt = await findByManageToken(token);
  if (!appt) return { error: "notFound" };

  const result = await cancelAppointment({ studio: appt.studio, appointmentId: appt.id, by: "client" });
  if (!result.ok) return { error: result.code };

  const en = appt.studio.locale === "en";
  await recordAudit({
    studioId: appt.studioId,
    actorLabel: appt.client.user.name,
    action: result.late ? "appointment.cancel_late" : "appointment.cancel",
    entityType: "Appointment",
    entityId: appt.id,
    metadata: { depositStatus: result.depositStatus },
  });
  await notifyOwners(appt.studioId, {
    url: "/agenda",
    template: "appointment_cancelled",
    subject: en ? `Cancelled — ${appt.client.user.name}` : `Canceló — ${appt.client.user.name}`,
    body: en
      ? `${appt.client.user.name} cancelled ${appt.serviceName} on ${whenText(appt.startsAt, appt.studio)}.${result.late ? " Late: the deposit is kept." : ""}`
      : `${appt.client.user.name} canceló ${appt.serviceName} del ${whenText(appt.startsAt, appt.studio)}.${result.late ? " Fuera de término: la seña queda." : ""}`,
    relatedType: "Appointment",
    relatedId: appt.id,
  });

  revalidatePath(PAGE, "page");
  return { ok: true };
}

const rescheduleSchema = z.object({ token: z.string().min(1), startsAt: z.string().datetime() });

export async function rescheduleByTokenAction(input: z.input<typeof rescheduleSchema>): Promise<ManageState> {
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return { error: "generic" };
  const appt = await findByManageToken(parsed.data.token);
  if (!appt) return { error: "notFound" };

  const before = appt.startsAt;
  const result = await rescheduleAppointment({
    studio: appt.studio,
    appointmentId: appt.id,
    startsAt: new Date(parsed.data.startsAt),
    by: "client",
  });
  if (!result.ok) return { error: result.code };

  const en = appt.studio.locale === "en";
  const after = new Date(parsed.data.startsAt);
  await notifyOwners(appt.studioId, {
    url: "/agenda",
    template: "appointment_moved",
    subject: en ? `Moved — ${appt.client.user.name}` : `Cambió de horario — ${appt.client.user.name}`,
    body: en
      ? `${appt.client.user.name} moved ${appt.serviceName} from ${whenText(before, appt.studio)} to ${whenText(after, appt.studio)}.`
      : `${appt.client.user.name} pasó ${appt.serviceName} del ${whenText(before, appt.studio)} al ${whenText(after, appt.studio)}.`,
    relatedType: "Appointment",
    relatedId: appt.id,
  });

  revalidatePath(PAGE, "page");
  return { ok: true };
}

/** A second chance at paying: the first checkout failed, or she chose later. */
export async function payDepositAction(_prev: ManageState, formData: FormData): Promise<ManageState> {
  const token = String(formData.get("token") ?? "");
  const method = String(formData.get("method") ?? "");
  const appt = await findByManageToken(token);
  if (!appt || appt.status !== "PENDING_PAYMENT") return { error: "notFound" };

  if (method === "transfer" && appt.studio.whatsappNumber) {
    await submitDepositTransfer(appt.id);
    await notifyTransferAnnounced(appt.id);
    revalidatePath(PAGE, "page");
    return { ok: true };
  }

  if (method === "mp" && isOnlinePaymentEnabled()) {
    const email = String(formData.get("email") ?? "").trim().toLowerCase() || appt.client.user.email;
    if (!email || !z.string().email().safeParse(email).success) return { error: "emailForMp" };
    if (!appt.client.user.email) {
      await db.user.update({ where: { id: appt.client.user.id }, data: { email } }).catch(() => null);
    }
    const manageUrl = manageUrlFor(appt.studio, token);
    const url = await startDepositCheckout({
      appointmentId: appt.id,
      payerEmail: email,
      successUrl: `${manageUrl}?paid=1`,
      failureUrl: `${manageUrl}?paid=0`,
      notificationUrl: `${appUrlFor(appt.studio)}/api/payments/webhook`,
    });
    if (url) redirect(url);
  }
  return { error: "generic" };
}
