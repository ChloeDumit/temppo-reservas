"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertStaff, assertAdmin } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { generateTempPassword } from "@/lib/auth/temp-password";

export type ActionState = {
  error?: string;
  ok?: boolean;
  /** Present only when an account was just created. Shown once, never stored. */
  tempPassword?: string;
} | null;

const studentSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(30).optional(),
  birthDate: z.string().optional(),
  healthNotes: z.string().trim().max(1000).optional(),
  emergencyContact: z.string().trim().max(120).optional(),
  emergencyPhone: z.string().trim().max(30).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function saveStudentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertStaff();
  const parsed = studentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.path[0] === "email" ? "invalidEmail" : "generic" };
  }

  const { id, name, email, phone, birthDate, healthNotes, emergencyContact, emergencyPhone, notes } =
    parsed.data;

  const profileData = {
    birthDate: birthDate ? new Date(`${birthDate}T00:00:00Z`) : null,
    healthNotes: healthNotes || null,
    emergencyContact: emergencyContact || null,
    emergencyPhone: emergencyPhone || null,
    notes: notes || null,
  };

  let issued: string | undefined;

  if (id) {
    const profile = await db.studentProfile.findFirst({
      where: { id, user: { studioId: user.studioId } },
      include: { user: true },
    });
    if (!profile) return { error: "notFound" };

    // Email is unique within the studio; guard before we hit the constraint.
    // Someone already training elsewhere under this address is fine — only a
    // second account in *this* studio is a clash.
    if (email !== profile.user.email) {
      const clash = await db.user.findFirst({ where: { studioId: user.studioId, email } });
      if (clash) return { error: "emailTaken" };
    }

    await db.studentProfile.update({
      where: { id },
      data: {
        ...profileData,
        user: { update: { name, email, phone: phone || null } },
      },
    });

    await recordAudit({
      studioId: user.studioId,
      actorId: user.id,
      actorLabel: user.name,
      action: "student.update",
      entityType: "StudentProfile",
      entityId: id,
      metadata: { name },
    });
  } else {
    // Only blocks a duplicate inside this studio. A student who already has an
    // account at another studio gets a second, independent one here.
    if (await db.user.findFirst({ where: { studioId: user.studioId, email } })) {
      return { error: "emailTaken" };
    }

    /*
      Issued here rather than left blank so staff can get someone signed in
      from the front desk. It is shown to staff exactly once, in the response
      below, and the student is held at the password screen until they replace
      it — so a password read aloud never becomes a permanent one.
    */
    const tempPassword = generateTempPassword();
    issued = tempPassword;

    const created = await db.user.create({
      data: {
        studioId: user.studioId,
        email,
        name,
        phone: phone || null,
        role: "STUDENT",
        passwordHash: await hashPassword(tempPassword),
        mustChangePassword: true,
        studentProfile: { create: profileData },
      },
      include: { studentProfile: true },
    });

    await recordAudit({
      studioId: user.studioId,
      actorId: user.id,
      actorLabel: user.name,
      action: "student.create",
      entityType: "StudentProfile",
      entityId: created.studentProfile!.id,
      metadata: { name, email },
    });
  }

  revalidatePath("/[locale]/(app)/students", "page");
  // The plaintext never touches the database or a log — this response is the
  // only place it exists.
  return { ok: true, tempPassword: issued };
}

export async function toggleBlockAction(formData: FormData) {
  const user = await assertStaff();
  const id = String(formData.get("id") ?? "");

  const profile = await db.studentProfile.findFirst({
    where: { id, user: { studioId: user.studioId } },
  });
  if (!profile) return;

  const bookingBlocked = !profile.bookingBlocked;
  await db.studentProfile.update({
    where: { id },
    // Unblocking also clears the counter, otherwise the next no-show re-blocks instantly.
    data: bookingBlocked ? { bookingBlocked } : { bookingBlocked, noShowCount: 0 },
  });

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: bookingBlocked ? "student.block" : "student.unblock",
    entityType: "StudentProfile",
    entityId: id,
  });

  revalidatePath("/[locale]/(app)/students", "page");
  revalidatePath("/[locale]/(app)/students/[id]", "page");
}

export async function resetNoShowsAction(formData: FormData) {
  const user = await assertStaff();
  const id = String(formData.get("id") ?? "");

  const profile = await db.studentProfile.findFirst({
    where: { id, user: { studioId: user.studioId } },
  });
  if (!profile) return;

  await db.studentProfile.update({
    where: { id },
    data: { noShowCount: 0, bookingBlocked: false },
  });

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "student.reset_no_shows",
    entityType: "StudentProfile",
    entityId: id,
  });

  revalidatePath("/[locale]/(app)/students/[id]", "page");
}

export async function toggleStudentActiveAction(formData: FormData) {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");

  const profile = await db.studentProfile.findFirst({
    where: { id, user: { studioId: user.studioId } },
    include: { user: true },
  });
  if (!profile) return;

  await db.user.update({
    where: { id: profile.userId },
    data: { isActive: !profile.user.isActive },
  });

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: profile.user.isActive ? "student.deactivate" : "student.reactivate",
    entityType: "StudentProfile",
    entityId: id,
  });

  revalidatePath("/[locale]/(app)/students", "page");
  revalidatePath("/[locale]/(app)/students/[id]", "page");
}
