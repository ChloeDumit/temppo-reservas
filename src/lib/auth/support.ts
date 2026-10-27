import "server-only";
import { db } from "@/lib/db";
import { generateToken, hashToken } from "./tokens";

/*
  Support visits: a platform admin opening a studio's own app as its owner, to
  change whatever the console has no form for.

  The visit starts in the console but has to land on the studio's host — a
  Temppo Beauty business lives on another domain, and cookies do not cross.
  So the console mints a one-use entry token good for two minutes, much like a
  magic link, and the studio's host trades it for a support session.
*/

const ENTRY_TTL_MINUTES = 2;

/** Who a support visit signs in as: the owner, or an admin if there is none. */
export async function supportTargetFor(studioId: string) {
  const people = await db.user.findMany({
    where: { studioId, isActive: true, role: { in: ["OWNER", "ADMIN"] } },
    orderBy: { createdAt: "asc" },
  });
  return people.find((p) => p.role === "OWNER") ?? people[0] ?? null;
}

export async function createSupportEntry(targetUserId: string, adminId: string) {
  const token = generateToken();
  await db.verificationToken.create({
    data: {
      userId: targetUserId,
      tokenHash: hashToken(token),
      purpose: "SUPPORT_ENTRY",
      payload: { adminId },
      expiresAt: new Date(Date.now() + ENTRY_TTL_MINUTES * 60_000),
    },
  });
  return token;
}

/**
 * Spends an entry token. Returns who to sign in as and on whose behalf, or null
 * when the token is unknown, used, stale, or its admin has lost the console.
 */
export async function consumeSupportEntry(token: string) {
  const record = await db.verificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { studio: true } } },
  });
  if (!record || record.purpose !== "SUPPORT_ENTRY" || record.usedAt || record.expiresAt < new Date()) return null;

  // Single use, spent before anything else can go wrong.
  await db.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });

  const adminId = (record.payload as { adminId?: unknown } | null)?.adminId;
  if (typeof adminId !== "string") return null;
  const admin = await db.user.findUnique({ where: { id: adminId } });
  if (!admin?.isActive || !admin.isPlatformAdmin || !record.user.isActive) return null;

  return { user: record.user, admin };
}
