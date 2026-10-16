"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertStaff, assertAdmin } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";

export type ClientState = { error?: string; ok?: boolean } | null;

const schema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(30).optional(),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email()]).optional(),
  allergies: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
});

/** The ficha: how to reach her, what she must not be exposed to, what to remember. */
export async function saveClientAction(_prev: ClientState, formData: FormData): Promise<ClientState> {
  const user = await assertStaff();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.path[0] === "email" ? "email" : "generic" };
  const v = parsed.data;

  const profile = await db.studentProfile.findFirst({ where: { id: v.id, user: { studioId: user.studioId } } });
  if (!profile) return { error: "generic" };

  try {
    await db.$transaction([
      db.user.update({
        where: { id: profile.userId },
        data: { name: v.name, phone: v.phone || null, email: v.email || null },
      }),
      db.studentProfile.update({
        where: { id: profile.id },
        data: { allergies: v.allergies || null, notes: v.notes || null },
      }),
    ]);
  } catch {
    // The email belongs to someone else at this studio.
    return { error: "emailTaken" };
  }

  revalidatePath("/[locale]/(app)/clients/[id]", "page");
  return { ok: true };
}

/** Lets someone blocked for no-shows book online again. */
export async function unblockClientAction(formData: FormData) {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const profile = await db.studentProfile.findFirst({ where: { id, user: { studioId: user.studioId } } });
  if (!profile) return;
  await db.studentProfile.update({ where: { id }, data: { bookingBlocked: false, noShowCount: 0 } });
  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "client.unblock",
    entityType: "StudentProfile",
    entityId: id,
  });
  revalidatePath("/[locale]/(app)/clients/[id]", "page");
}
