"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { notify, notifyOwners } from "@/lib/notifications";

export type LeadState = { error?: string; ok?: boolean } | null;

const leadSchema = z.object({
  slug: z.string().trim().min(1),
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(30).optional(),
  message: z.string().trim().max(500).optional(),
  classInstanceId: z.string().optional(),
  source: z.string().trim().max(40).optional(),
});

/**
 * Public trial-class request. Deliberately account-free: this is the landing
 * point for Instagram traffic, so the only ask is a name and a way to reply.
 */
export async function submitLeadAction(
  _prev: LeadState,
  formData: FormData,
): Promise<LeadState> {
  const parsed = leadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.path[0] === "email" ? "invalidEmail" : "generic" };
  }

  // Honeypot: real people leave this empty.
  if (String(formData.get("website") ?? "").trim() !== "") return { ok: true };

  const studio = await db.studio.findUnique({ where: { slug: parsed.data.slug } });
  if (!studio) return { error: "notFound" };

  // Light rate limit: one pending lead per email per studio per hour.
  const recent = await db.lead.findFirst({
    where: {
      studioId: studio.id,
      email: parsed.data.email,
      createdAt: { gt: new Date(Date.now() - 3_600_000) },
    },
  });
  if (recent) return { ok: true };

  let classInstanceId: string | null = null;
  if (parsed.data.classInstanceId) {
    const instance = await db.classInstance.findFirst({
      where: {
        id: parsed.data.classInstanceId,
        studioId: studio.id,
        status: "SCHEDULED",
        allowTrialBooking: true,
        startsAt: { gt: new Date() },
      },
    });
    classInstanceId = instance?.id ?? null;
  }

  const lead = await db.lead.create({
    data: {
      studioId: studio.id,
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      message: parsed.data.message || null,
      source: parsed.data.source || null,
      classInstanceId,
      status: classInstanceId ? "BOOKED" : "NEW",
    },
  });

  // Tell the studio, and confirm to the person who asked.
  await notifyOwners(studio.id, {
    url: "/students",
    template: "lead_new",
    subject: `${studio.name} — nueva clase de prueba`,
    body: `${parsed.data.name} pidió una clase de prueba.\nEmail: ${parsed.data.email}${parsed.data.phone ? `\nTel: ${parsed.data.phone}` : ""}${parsed.data.message ? `\n\n"${parsed.data.message}"` : ""}`,
    relatedType: "Lead",
    relatedId: lead.id,
  });

  await notify("EMAIL", {
    studioId: studio.id,
    to: parsed.data.email,
    template: "lead_confirmation",
    subject: `${studio.name}`,
    body:
      studio.locale === "en"
        ? `Hi ${parsed.data.name}, thanks for reaching out to ${studio.name}. We'll be in touch shortly to confirm your trial class.`
        : `Hola ${parsed.data.name}, gracias por escribirnos a ${studio.name}. Te contactamos en breve para confirmar tu clase de prueba.`,
    relatedType: "Lead",
    relatedId: lead.id,
  });

  const h = await headers();
  await recordAudit({
    studioId: studio.id,
    actorLabel: parsed.data.name,
    action: "lead.create",
    entityType: "Lead",
    entityId: lead.id,
    metadata: {
      email: parsed.data.email,
      classInstanceId,
      referer: h.get("referer") ?? null,
    },
  });

  return { ok: true };
}
