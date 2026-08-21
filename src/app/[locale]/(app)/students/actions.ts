"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertStaff, assertAdmin } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { generateTempPassword } from "@/lib/auth/temp-password";
import { normalizeDocumentId, PIN_MIN_LENGTH, PIN_MAX_LENGTH } from "@/lib/auth/document";
import { currentLocationId } from "@/lib/locations";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { notify } from "@/lib/notifications";

export type ActionState = {
  error?: string;
  ok?: boolean;
  /** Present only when an account was just created. Shown once, never stored. */
  tempPassword?: string;
} | null;

const studentSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(80),
  // Optional now: an older student may have no email and sign in by cédula.
  email: z.union([z.string().trim().toLowerCase().email(), z.literal("")]).optional(),
  documentId: z.string().trim().max(30).optional(),
  pin: z.string().trim().max(PIN_MAX_LENGTH).optional(),
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

  // Repeated form keys collapse in Object.fromEntries, so read these directly.
  const requestedLocationIds = formData.getAll("locationIds").map(String).filter(Boolean);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.path[0] === "email" ? "invalidEmail" : "generic" };
  }

  const { id, name, phone, birthDate, healthNotes, emergencyContact, emergencyPhone, notes } =
    parsed.data;

  // Cross-field rules, kept out of zod so each one gets its own message.
  const email = parsed.data.email?.trim() ? parsed.data.email.trim() : null;
  const documentId = parsed.data.documentId?.trim()
    ? normalizeDocumentId(parsed.data.documentId)
    : null;
  const pin = parsed.data.pin?.trim() || null;

  // Without one of the two there is no way to tell this person apart, and no
  // way for them to ever sign in.
  if (!email && !documentId) return { error: "needHandle" };
  if (pin && (pin.length < PIN_MIN_LENGTH || pin.length > PIN_MAX_LENGTH)) {
    return { error: "invalidPin" };
  }
  // Email accounts get a temporary password instead; a cédula-only account has
  // nothing to sign in with unless a PIN is set here and now.
  if (!id && !email && !pin) return { error: "pinRequired" };

  // Only sucursales this studio actually owns, so a tampered form cannot
  // attach a student to somebody else's.
  const ownedLocations = requestedLocationIds.length
    ? await db.location.findMany({
        where: { id: { in: requestedLocationIds }, studioId: user.studioId },
        select: { id: true },
      })
    : [];
  const locationIds = ownedLocations.map((location) => location.id);

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

    // Both handles are unique within the studio; guard before hitting the
    // constraint. Someone already training elsewhere under the same address or
    // cédula is fine — only a second account in *this* studio is a clash.
    if (email && email !== profile.user.email) {
      const clash = await db.user.findFirst({ where: { studioId: user.studioId, email } });
      if (clash) return { error: "emailTaken" };
    }
    if (documentId && documentId !== profile.user.documentId) {
      const clash = await db.user.findFirst({ where: { studioId: user.studioId, documentId } });
      if (clash) return { error: "documentTaken" };
    }

    await db.studentProfile.update({
      where: { id },
      data: {
        ...profileData,
        ...(requestedLocationIds.length
          ? { locations: { set: locationIds.map((id) => ({ id })) } }
          : {}),
        user: {
          update: {
            name,
            email,
            documentId,
            phone: phone || null,
            // Blank leaves the existing PIN alone; filling it in resets one.
            ...(pin ? { pinHash: await hashPassword(pin) } : {}),
          },
        },
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
    if (email && (await db.user.findFirst({ where: { studioId: user.studioId, email } }))) {
      return { error: "emailTaken" };
    }
    if (
      documentId &&
      (await db.user.findFirst({ where: { studioId: user.studioId, documentId } }))
    ) {
      return { error: "documentTaken" };
    }

    /*
      Issued here rather than left blank so staff can get someone signed in
      from the front desk. It is shown to staff exactly once, in the response
      below, and the student is held at the password screen until they replace
      it — so a password read aloud never becomes a permanent one.
    */
    // Only worth issuing when there is an email to sign in with; a cédula-only
    // account uses its PIN instead.
    const tempPassword = email ? generateTempPassword() : null;
    issued = tempPassword ?? undefined;

    const fallback = locationIds.length ? null : await currentLocationId(user.studioId);
    const attach = locationIds.length ? locationIds : fallback ? [fallback] : [];

    const created = await db.user.create({
      data: {
        studioId: user.studioId,
        email,
        documentId,
        name,
        phone: phone || null,
        role: "STUDENT",
        ...(tempPassword
          ? { passwordHash: await hashPassword(tempPassword), mustChangePassword: true }
          : {}),
        ...(pin ? { pinHash: await hashPassword(pin) } : {}),
        studentProfile: {
          create: {
            ...profileData,
            ...(attach.length ? { locations: { connect: attach.map((id) => ({ id })) } } : {}),
          },
        },
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

    /*
      Nothing used to reach the student at all: the account was created, the
      temporary password was shown to whoever was at the desk, and that was the
      only route in. If the student was not standing there — most of them, since
      staff add people between classes — nobody ever told them they had an
      account.

      So they get a link of their own. It carries the same seven-day window as a
      staff invite, and it signs them in without the password having to be read
      out at all; the password stays valid as the in-person fallback.
    */
    if (created.email) {
      const token = generateToken();
      await db.verificationToken.create({
        data: {
          userId: created.id,
          tokenHash: hashToken(token),
          purpose: "MAGIC_LINK",
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
        },
      });

      const base = process.env.APP_URL || "http://localhost:3000";
      await notify({
        studioId: user.studioId,
        to: created.email,
        template: "student_invite",
        subject: `${user.studio.name} — TEMPPO Reservas`,
        body: `Hola ${created.name},\n\n${user.studio.name} te dio de alta en TEMPPO Reservas. Desde acá podés reservar tus clases, ver tus packs y tu historial.\n\nEntrá acá: ${base}/api/auth/magic?token=${token}&locale=${user.studio.locale}`,
        relatedType: "User",
        relatedId: created.id,
      });
    }
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
