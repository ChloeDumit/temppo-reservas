"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertStaff } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { bookClass } from "@/lib/booking";

/** Turns an enquiry into a real student, booking their chosen slot if any. */
export async function convertLeadAction(formData: FormData) {
  const user = await assertStaff();
  const leadId = String(formData.get("leadId") ?? "");

  const lead = await db.lead.findFirst({
    where: { id: leadId, studioId: user.studioId },
  });
  if (!lead || lead.status === "CONVERTED") return;

  // Scoped to this studio: the same address may already be a student at
  // another one, which says nothing about whether they exist here.
  const existing = await db.user.findFirst({
    where: { studioId: user.studioId, email: lead.email },
    include: { studentProfile: true },
  });

  let studentId = existing?.studentProfile?.id ?? null;

  if (!studentId) {
    // A clash here means the email belongs to a staff account — leave it alone.
    if (existing) return;

    const created = await db.user.create({
      data: {
        studioId: user.studioId,
        email: lead.email,
        name: lead.name,
        phone: lead.phone,
        role: "STUDENT",
        studentProfile: { create: { notes: lead.message } },
      },
      include: { studentProfile: true },
    });
    studentId = created.studentProfile!.id;
  }

  await db.lead.update({
    where: { id: lead.id },
    data: { status: "CONVERTED", convertedStudentId: studentId },
  });

  // A trial class is on the house — booked by staff, so no credit is required.
  if (lead.classInstanceId) {
    await bookClass({
      studio: user.studio,
      studentId,
      classInstanceId: lead.classInstanceId,
      source: "TRIAL",
      bypassWindow: true,
    });
  }

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "lead.convert",
    entityType: "Lead",
    entityId: lead.id,
    metadata: { studentId, classInstanceId: lead.classInstanceId },
  });

  revalidatePath("/[locale]/(app)/leads", "page");
  revalidatePath("/[locale]/(app)/students", "page");
}

export async function dismissLeadAction(formData: FormData) {
  const user = await assertStaff();
  const leadId = String(formData.get("leadId") ?? "");

  const lead = await db.lead.findFirst({ where: { id: leadId, studioId: user.studioId } });
  if (!lead) return;

  await db.lead.update({ where: { id: lead.id }, data: { status: "LOST" } });

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "lead.dismiss",
    entityType: "Lead",
    entityId: lead.id,
  });

  revalidatePath("/[locale]/(app)/leads", "page");
}
