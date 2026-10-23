"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { depositMethods } from "@/lib/appointments/methods";
import { appUrlFor } from "@/lib/brand/url";
import { localePath } from "@/i18n/routing";
import { availabilityQuery } from "@/lib/appointments/availability";
import { findSlots } from "@/lib/appointments/slots";
import { bookAppointment } from "@/lib/appointments/book";
import { findOrCreateClient } from "@/lib/appointments/clients";
import { startDepositCheckout, submitDepositTransfer } from "@/lib/appointments/payments";
import { manageUrlFor, notifyBooked } from "@/lib/appointments/notify";

async function bookableStudio(slug: string) {
  const studio = await db.studio.findUnique({ where: { slug } });
  if (!studio || studio.vertical !== "APPOINTMENTS" || studio.suspendedAt) return null;
  return studio;
}

const slotsSchema = z.object({
  slug: z.string().min(1),
  serviceId: z.string().min(1),
  addOnIds: z.array(z.string()).max(10).default([]),
  staffId: z.string().nullable(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.number().int().min(1).max(21),
});

export type DayOption = { date: string; slots: { start: string; staffIds: string[] }[] };

/** Open times for a service, a fortnight or so at a time. */
export async function getSlotsAction(input: z.input<typeof slotsSchema>): Promise<DayOption[]> {
  const parsed = slotsSchema.safeParse(input);
  if (!parsed.success) return [];
  const studio = await bookableStudio(parsed.data.slug);
  if (!studio) return [];

  const found = await availabilityQuery(studio, parsed.data);
  if (!found) return [];
  return findSlots(found.query).map((d) => ({
    date: d.date,
    slots: d.slots.map((s) => ({ start: s.start.toISOString(), staffIds: s.staffIds })),
  }));
}

const bookSchema = z.object({
  slug: z.string().min(1),
  serviceId: z.string().min(1),
  staffId: z.string().optional(),
  startsAt: z.string().datetime(),
  name: z.string().trim().min(2).max(80),
  phone: z
    .string()
    .trim()
    .min(6)
    .max(30)
    .refine((p) => p.replace(/\D/g, "").length >= 7),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email()]).optional(),
  notes: z.string().trim().max(300).optional(),
  pay: z.enum(["mp", "transfer", ""]).optional(),
});

export type BookState = { error?: string } | null;

/**
 * The public booking. No account: name and phone are the identity. With a
 * deposit due she goes straight to Mercado Pago, or to her booking page with
 * the transfer details; otherwise straight to her confirmed booking.
 */
export async function bookPublicAction(_prev: BookState, formData: FormData): Promise<BookState> {
  // Honeypot: real people leave this empty.
  if (String(formData.get("website") ?? "").trim() !== "") return { error: "generic" };

  const parsed = bookSchema.safeParse({
    ...Object.fromEntries(formData),
    addOnIds: undefined,
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { error: field === "phone" ? "phone" : field === "email" ? "email" : field === "name" ? "name" : "generic" };
  }
  const v = parsed.data;
  const addOnIds = formData.getAll("addOnIds").map(String).slice(0, 10);

  const studio = await bookableStudio(v.slug);
  if (!studio) return { error: "generic" };

  // Which ways to pay exist decides whether a deposit can be asked for at all.
  const { mp: canMp, transfer: canTransfer } = depositMethods(studio);
  const pay = v.pay === "mp" && canMp ? "mp" : v.pay === "transfer" && canTransfer ? "transfer" : null;
  if (pay === "mp" && !v.email) return { error: "emailForMp" };

  const { profile } = await findOrCreateClient(studio.id, { name: v.name, phone: v.phone, email: v.email || null });

  // A light brake on someone filling a calendar with unpaid holds.
  const holding = await db.appointment.count({
    where: { clientId: profile.id, status: "PENDING_PAYMENT", holdExpiresAt: { gt: new Date() } },
  });
  if (holding >= 2) return { error: "tooManyHolds" };

  const result = await bookAppointment({
    studio,
    clientId: profile.id,
    serviceId: v.serviceId,
    addOnIds,
    staffId: v.staffId || null,
    startsAt: new Date(v.startsAt),
    source: "CLIENT_PUBLIC",
    collectDeposit: canMp || canTransfer,
    clientNotes: v.notes,
  });
  if (!result.ok) return { error: result.code };

  await recordAudit({
    studioId: studio.id,
    actorLabel: v.name,
    action: "appointment.book_public",
    entityType: "Appointment",
    entityId: result.appointmentId,
    metadata: { serviceId: v.serviceId, depositCents: result.depositCents },
  });

  const manageUrl = manageUrlFor(studio, result.manageToken);

  if (result.pending && pay === "transfer") await submitDepositTransfer(result.appointmentId);
  await notifyBooked(result.appointmentId, result.manageToken);

  if (result.pending && pay === "mp" && v.email) {
    const base = appUrlFor(studio);
    const checkout = await startDepositCheckout({
      appointmentId: result.appointmentId,
      payerEmail: v.email,
      successUrl: `${manageUrl}?paid=1`,
      failureUrl: `${manageUrl}?paid=0`,
      notificationUrl: `${base}/api/payments/webhook`,
    }).catch((error) => {
      console.error("[book] checkout failed", error);
      return null;
    });
    if (checkout) redirect(checkout);
  }

  redirect(`${localePath(studio.locale, `/m/${result.manageToken}`)}?new=1`);
}
