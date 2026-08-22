"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import {
  createStudioChoice,
  resolveStudioChoice,
  consumeStudioChoice,
} from "@/lib/auth/studio-choice";
import { MAGIC_LINK_TTL_MINUTES } from "@/lib/auth/constants";
import { uniqueSlug } from "@/lib/slug";
import { normalizeDocumentId, PIN_MIN_LENGTH, PIN_MAX_LENGTH } from "@/lib/auth/document";
import { notify, notifyPlatformAdmins } from "@/lib/notifications";
import { recordAudit } from "@/lib/audit";
import { localePath } from "@/i18n/routing";

export type AuthState = { error?: string; sent?: boolean } | null;

const emailSchema = z.string().trim().toLowerCase().email();

async function requestMeta() {
  const h = await headers();
  return {
    userAgent: h.get("user-agent"),
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  };
}

const signInSchema = z.object({
  identifier: z.string().trim().min(3).max(160),
  secret: z.string().min(1).max(200),
});

/**
 * One sign-in for both kinds of handle.
 *
 * Email-and-password and cédula-and-PIN used to be separate forms behind
 * separate buttons, which asked the person signing in to know which kind of
 * account they had been given — a question the studio's front desk cannot
 * answer for them either.
 *
 * So: one field for the handle, one for the secret. An "@" decides which
 * column to look in, and BOTH stored hashes are then checked, because the two
 * credentials are not really alternatives in practice. A student with a cédula
 * on file is usually also issued a temporary password, and nothing is gained by
 * refusing the one they actually remember.
 */
export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const locale = await getLocale();
  const parsed = signInSchema.safeParse({
    identifier: formData.get("identifier"),
    secret: formData.get("secret"),
  });
  const requestedNext = String(formData.get("next") ?? "");

  if (!parsed.success) return { error: "invalidCredentials" };

  const { identifier, secret } = parsed.data;
  const byEmail = identifier.includes("@");

  // The same handle can exist at several studios, each with its own hashes.
  const candidates = byEmail
    ? await db.user.findMany({ where: { email: identifier.toLowerCase() } })
    : await db.user.findMany({ where: { documentId: normalizeDocumentId(identifier) } });

  const verified = [];
  for (const candidate of candidates) {
    const hashes = [candidate.passwordHash, candidate.pinHash].filter(
      (hash): hash is string => Boolean(hash),
    );

    for (const hash of hashes) {
      if (await verifyPassword(secret, hash)) {
        verified.push(candidate);
        break;
      }
    }
  }

  if (verified.length === 0) return { error: "invalidCredentials" };

  const usable = verified.filter((candidate) => candidate.isActive);
  if (usable.length === 0) return { error: "accountInactive" };

  // Proven, but ambiguous — let them say which studio they meant.
  if (usable.length > 1) {
    const choice = await createStudioChoice(usable.map((candidate) => candidate.id));
    const params = new URLSearchParams({ token: choice });
    if (requestedNext) params.set("next", requestedNext);
    redirect(localePath(locale, `/login/studio?${params.toString()}`));
  }

  const user = usable[0];

  await createSession(user.id, await requestMeta());
  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "auth.login",
    entityType: "User",
    entityId: user.id,
    metadata: { handle: byEmail ? "email" : "document" },
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

  const accounts = await db.user.findMany({ where: { email: parsed.data, isActive: true } });
  const user = accounts[0];

  // Always report success — otherwise this endpoint tells the world who has an account.
  if (user) {
    // One link for the address. Which studio it opens is settled after the
    // click, so a person at three studios still gets a single email.
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

    await notify({
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

  const base = process.env.APP_URL || "http://localhost:3000";

  await notify({
    studioId: user.studioId,
    to: user.email,
    template: "welcome",
    subject: `${studioName} — TEMPPO Reservas`,
    body:
      locale === "en"
        ? `Hi ${name}, ${studioName} is ready on TEMPPO Reservas.\n\nYour trial runs until ${trialEndsAt.toLocaleDateString("en")}. Start by adding your classes and packs:\n${base}${localePath(locale, "/dashboard")}\n\nYour public booking page is ${base}${localePath(locale, `/t/${slug}`)} — share it wherever your students find you.`
        : `Hola ${name}, ${studioName} ya está listo en TEMPPO Reservas.\n\nTu prueba va hasta el ${trialEndsAt.toLocaleDateString("es")}. Empezá cargando tus clases y packs:\n${base}${localePath(locale, "/dashboard")}\n\nTu página pública de reservas es ${base}${localePath(locale, `/t/${slug}`)} — compartila donde te encuentren tus alumnas.`,
    relatedType: "Studio",
    relatedId: user.studioId,
  });

  /*
    Platform-level heads-up. A signup is invisible from inside the tenant, and
    the first hours after one are when a studio is most worth a phone call —
    so this goes to everyone who can open the console, with a link straight to
    the studio's record there.
  */
  await notifyPlatformAdmins(user.studioId, {
    template: "signup_ops",
    subject: `Nueva cuenta — ${studioName}`,
    body: [
      `${name} <${email}> creó ${studioName}.`,
      "",
      `Slug: ${slug}`,
      `Idioma: ${locale}`,
      `Prueba hasta: ${trialEndsAt.toISOString().slice(0, 10)}`,
      "",
      `${base}${localePath(locale, `/admin/studios/${user.studioId}`)}`,
    ].join("\n"),
    relatedType: "Studio",
    relatedId: user.studioId,
  });

  redirect(localePath(locale, "/dashboard"));
}

export async function logoutAction() {
  const locale = await getLocale();
  await destroySession();
  redirect(localePath(locale, "/login"));
}

/**
 * Completes a login that matched accounts at more than one studio. The choice
 * token carries the candidates, so this cannot be pointed at any other account
 * even with a valid token and a guessed id.
 */
export async function chooseStudioAction(formData: FormData) {
  const locale = await getLocale();
  const token = String(formData.get("token") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const requestedNext = String(formData.get("next") ?? "");

  const resolved = await resolveStudioChoice(token);
  if (!resolved) redirect(localePath(locale, "/login?error=magic"));

  const chosen = resolved.users.find((candidate) => candidate.id === userId);
  if (!chosen) redirect(localePath(locale, "/login?error=magic"));

  await consumeStudioChoice(resolved.record.id);
  await createSession(chosen.id, await requestMeta());

  await recordAudit({
    studioId: chosen.studioId,
    actorId: chosen.id,
    actorLabel: chosen.name,
    action: "auth.studio_choice",
    entityType: "User",
    entityId: chosen.id,
  });

  const home = chosen.role === "STUDENT" ? "/my" : "/dashboard";
  const destination =
    requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : localePath(locale, home);

  redirect(destination);
}

