import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";
import { generateToken, hashToken } from "./tokens";
import { SESSION_COOKIE, SESSION_TTL_DAYS, SUPPORT_COOKIE, SUPPORT_TTL_MINUTES } from "./constants";

export async function createSession(
  userId: string,
  meta?: { userAgent?: string | null; ipAddress?: string | null },
) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);

  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: meta?.userAgent ?? null,
      ipAddress: meta?.ipAddress ?? null,
    },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

const userInclude = {
  user: {
    include: {
      studio: true,
      studentProfile: true,
      instructorProfile: true,
    },
  },
} as const;

/**
 * Opens a platform admin's support visit as `userId`. It sits beside whatever
 * session this browser already has, and wins over it until it ends.
 */
export async function createSupportSession(
  userId: string,
  supportById: string,
  meta?: { userAgent?: string | null; ipAddress?: string | null },
) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SUPPORT_TTL_MINUTES * 60_000);

  await db.session.create({
    data: {
      userId,
      supportById,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: meta?.userAgent ?? null,
      ipAddress: meta?.ipAddress ?? null,
    },
  });

  const store = await cookies();
  store.set(SUPPORT_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/**
 * The support visit this request belongs to, or null. Re-checks the admin on
 * every request, so taking away their platform flag ends a visit in progress.
 */
export const getSupportSession = cache(async () => {
  const store = await cookies();
  const token = store.get(SUPPORT_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { ...userInclude, supportBy: { include: { studio: { select: { brand: true } } } } },
  });

  if (!session?.supportBy || session.expiresAt < new Date()) return null;
  const { supportBy } = session;
  if (!session.user.isActive || !supportBy.isActive || !supportBy.isPlatformAdmin) return null;
  return { ...session, supportBy, supportById: supportBy.id };
});

export async function endSupportSession() {
  const store = await cookies();
  const token = store.get(SUPPORT_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: hashToken(token), supportById: { not: null } } });
  }
  store.delete(SUPPORT_COOKIE);
}

/**
 * Resolves the signed-in user for this request. Cached per request so several
 * server components can call it without repeating the query.
 */
export const getCurrentUser = cache(async () => {
  const support = await getSupportSession();
  if (support) return support.user;

  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: userInclude,
  });

  if (!session || session.expiresAt < new Date()) return null;
  if (!session.user.isActive) return null;

  return session.user;
});

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  store.delete(SESSION_COOKIE);
}
