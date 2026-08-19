"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { MAGIC_LINK_TTL_MINUTES } from "@/lib/auth/constants";
import { uniqueSlug } from "@/lib/slug";
import { notify } from "@/lib/notifications";
import { recordAudit } from "@/lib/audit";

export type AuthState = { error?: string; sent?: boolean } | null;

const emailSchema = z.string().trim().toLowerCase().email();

async function requestMeta() {
  const h = await headers();
  return {
    userAgent: h.get("user-agent"),
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  };
}

function localePath(locale: string, path: string) {
  return locale === "es" ? path : `/${locale}${path}`;
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const locale = await getLocale();
  const email = emailSchema.safeParse(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const requestedNext = String(formData.get("next") ?? "");

  if (!email.success) return { error: "invalidCredentials" };

  const user = await db.user.findUnique({ where: { email: email.data } });
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "invalidCredentials" };
  }
  if (!user.isActive) return { error: "accountInactive" };

  await createSession(user.id, await requestMeta());
  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "auth.login",
    entityType: "User",
    entityId: user.id,
  });

  // Only honour a relative path, so `next` can't be used to bounce elsewhere.
  const home = user.role === "STUDENT" ? "/my" : "/dashboard";
  const destination =
    requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : localePath(locale, home);

  redirect(destination);
}

export async function magicLinkAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const locale = await getLocale();
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "invalidEmail" };

  const user = await db.user.findUnique({ where: { email: parsed.data } });

  // Always report success — otherwise this endpoint tells the world who has an account.
  if (user?.isActive) {
    const token = generateToken();
    await db.verificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        purpose: "MAGIC_LINK",
        expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MINUTES * 60_000),
      },
    });

    const base = process.env.APP_URL || "http://localhost:3000";
    // API routes are not locale-prefixed; the locale rides along as a param.
    const link = `${base}/api/auth/magic?token=${token}&locale=${locale}`;

    await notify("EMAIL", {
      studioId: user.studioId,
      to: user.email,
      template: "magic_link",
      subject: "TEMPPO Reservas — acceso / login",
      body: `Hola ${user.name},\n\nEntrá con este enlace (vence en ${MAGIC_LINK_TTL_MINUTES} minutos):\n${link}\n\nSi no lo pediste, ignorá este mensaje.`,
      relatedType: "User",
      relatedId: user.id,
    });
  }

  return { sent: true };
}

const registerSchema = z.object({
  studioName: z.string().trim().min(2).max(80),
  name: z.string().trim().min(2).max(80),
  email: emailSchema,
  password: z.string().min(8).max(200),
});

export async function registerAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const locale = await getLocale();
  const parsed = registerSchema.safeParse({
    studioName: formData.get("studioName"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue.path[0] === "password") return { error: "passwordTooShort" };
    if (issue.path[0] === "email") return { error: "invalidEmail" };
    return { error: "generic" };
  }

  const { studioName, name, email, password } = parsed.data;

  if (await db.user.findUnique({ where: { email } })) {
    return { error: "emailTaken" };
  }

  const slug = await uniqueSlug(studioName, async (candidate) =>
    Boolean(await db.studio.findUnique({ where: { slug: candidate } })),
  );

  const trialEndsAt = new Date(Date.now() + 30 * 86_400_000);
  // Hashed before the transaction — bcrypt is slow and would hold the tx open.
  const passwordHash = await hashPassword(password);

  const user = await db.$transaction(async (tx) => {
    const studio = await tx.studio.create({
      data: {
        name: studioName,
        slug,
        locale,
        plan: "TRIAL",
        trialEndsAt,
        // Every new studio gets a default location so the schedule works immediately.
        locations: { create: { name: studioName } },
      },
    });

    return tx.user.create({
      data: {
        studioId: studio.id,
        email,
        name,
        role: "OWNER",
        passwordHash,
        emailVerified: new Date(),
        locale,
      },
    });
  });

  await createSession(user.id, await requestMeta());
  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "studio.create",
    entityType: "Studio",
    entityId: user.studioId,
    metadata: { studioName, slug },
  });

  redirect(localePath(locale, "/dashboard"));
}

export async function logoutAction() {
  const locale = await getLocale();
  await destroySession();
  redirect(localePath(locale, "/login"));
}
