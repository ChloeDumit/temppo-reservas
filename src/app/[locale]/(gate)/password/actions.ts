"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertUser } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";
import { recordAudit } from "@/lib/audit";
import { homePathFor } from "@/lib/auth/guards";
import { localePath } from "@/i18n/routing";
import { getLocale } from "next-intl/server";

export type PasswordState = { error?: string } | null;

const schema = z
  .object({
    password: z.string().min(8),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"] });

/** Replaces a temporary password with one the account holder chose. */
export async function setPasswordAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const user = await assertUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    const tooShort = String(formData.get("password") ?? "").length < 8;
    return { error: tooShort ? "passwordShort" : "passwordMismatch" };
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(parsed.data.password),
      mustChangePassword: false,
    },
  });

  // Everything else signed in with the temporary password is no longer
  // trusted — whoever was handed it should not keep access.
  await db.session.deleteMany({ where: { userId: user.id } });

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "auth.password_set",
    entityType: "User",
    entityId: user.id,
  });

  const locale = await getLocale();
  redirect(localePath(locale, "/login"));
}
