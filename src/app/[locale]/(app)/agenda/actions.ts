"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertStaff } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { wallTimeToUtc } from "@/lib/dates";
import { bookAppointment, cancelAppointment, markAppointment, rescheduleAppointment } from "@/lib/appointments/book";
import { findOrCreateClient } from "@/lib/appointments/clients";
import { markDepositReceived } from "@/lib/appointments/payments";
import { afterDepositSettled } from "@/lib/appointments/notify";

export type AgendaState = { error?: string; ok?: boolean } | null;

const PAGE = "/[locale]/(app)/agenda";

async function staffOnAppointmentStudio() {
  const user = await assertStaff();
  if (user.studio.vertical !== "APPOINTMENTS") throw new Error("FORBIDDEN");
  return user;
}

const createSchema = z.object({
  clientId: z.string().optional(),
  clientName: z.string().trim().max(80).optional(),
  clientPhone: z.string().trim().max(30).optional(),
  serviceId: z.string().min(1),
  staffId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().trim().max(300).optional(),
});

/**
 * Staff booking someone in from the agenda — a call, a DM, a walk-in. It may
 * fall outside hours or inside the notice, but never on top of someone else.
 */
export async function createStaffAppointmentAction(_prev: AgendaState, formData: FormData): Promise<AgendaState> {
  const user = await staffOnAppointmentStudio();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "generic" };
  const v = parsed.data;

  let clientId = v.clientId || null;
  if (clientId) {
    const exists = await db.studentProfile.findFirst({ where: { id: clientId, user: { studioId: user.studioId } } });
    if (!exists) return { error: "generic" };
  } else {
    if (!v.clientName || v.clientName.length < 2 || !v.clientPhone) return { error: "client" };
    clientId = (await findOrCreateClient(user.studioId, { name: v.clientName, phone: v.clientPhone })).profile.id;
  }

  const result = await bookAppointment({
    studio: user.studio,
    clientId,
    serviceId: v.serviceId,
    addOnIds: formData.getAll("addOnIds").map(String),
    staffId: v.staffId,
    startsAt: wallTimeToUtc(v.date, v.time, user.studio.timezone),
    source: "STAFF",
    collectDeposit: false,
    clientNotes: v.notes,
  });
  if (!result.ok) return { error: result.code };

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "appointment.create",
    entityType: "Appointment",
    entityId: result.appointmentId,
  });
  revalidatePath(PAGE, "page");
  return { ok: true };
}

const moveSchema = z.object({
  id: z.string().min(1),
  staffId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
});

export async function moveAppointmentAction(_prev: AgendaState, formData: FormData): Promise<AgendaState> {
  const user = await staffOnAppointmentStudio();
  const parsed = moveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "generic" };
  const v = parsed.data;
  const staff = await db.user.findFirst({ where: { id: v.staffId, studioId: user.studioId } });
  if (!staff) return { error: "generic" };

  const result = await rescheduleAppointment({
    studio: user.studio,
    appointmentId: v.id,
    staffId: v.staffId,
    startsAt: wallTimeToUtc(v.date, v.time, user.studio.timezone),
    by: "staff",
  });
  if (!result.ok) return { error: result.code };

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "appointment.move",
    entityType: "Appointment",
    entityId: v.id,
    metadata: { date: v.date, time: v.time, staffId: v.staffId },
  });
  revalidatePath(PAGE, "page");
  return { ok: true };
}

export async function cancelStaffAppointmentAction(_prev: AgendaState, formData: FormData): Promise<AgendaState> {
  const user = await staffOnAppointmentStudio();
  const id = String(formData.get("id") ?? "");
  const result = await cancelAppointment({
    studio: user.studio,
    appointmentId: id,
    by: "staff",
    reason: String(formData.get("reason") ?? "").slice(0, 200) || null,
  });
  if (!result.ok) return { error: result.code };
  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "appointment.cancel_by_staff",
    entityType: "Appointment",
    entityId: id,
    metadata: { depositStatus: result.depositStatus },
  });
  revalidatePath(PAGE, "page");
  return { ok: true };
}

export async function markAppointmentAction(formData: FormData) {
  const user = await staffOnAppointmentStudio();
  const outcome = String(formData.get("outcome"));
  if (outcome !== "COMPLETED" && outcome !== "NO_SHOW") return;
  const id = String(formData.get("id") ?? "");
  await markAppointment({ studio: user.studio, appointmentId: id, outcome });
  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: outcome === "NO_SHOW" ? "appointment.no_show" : "appointment.complete",
    entityType: "Appointment",
    entityId: id,
  });
  revalidatePath(PAGE, "page");
}

export async function saveStaffNoteAction(formData: FormData) {
  const user = await staffOnAppointmentStudio();
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("staffNotes") ?? "").slice(0, 1000);
  await db.appointment.updateMany({ where: { id, studioId: user.studioId }, data: { staffNotes: note || null } });
  revalidatePath(PAGE, "page");
}

/** The deposit came in by transfer or cash: confirm the appointment. */
export async function markDepositPaidAction(formData: FormData) {
  const user = await staffOnAppointmentStudio();
  const id = String(formData.get("id") ?? "");
  const method = formData.get("method") === "CASH" ? "CASH" : "BANK_TRANSFER";
  const outcome = await markDepositReceived({ studioId: user.studioId, appointmentId: id, method, approvedById: user.id });
  if (outcome) await afterDepositSettled(id, outcome, user.name);
  revalidatePath(PAGE, "page");
  revalidatePath("/[locale]/(app)/dashboard", "page");
  revalidatePath("/[locale]/(app)/payments", "page");
}
