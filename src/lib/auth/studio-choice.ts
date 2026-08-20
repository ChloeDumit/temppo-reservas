import "server-only";
import { db } from "@/lib/db";
import { generateToken, hashToken } from "./tokens";
import { STUDIO_CHOICE_TTL_MINUTES } from "./constants";

/**
 * Parks a login that has been proven but still points at more than one studio.
 *
 * The candidate accounts are written onto the token itself rather than being
 * re-derived from the email at selection time. That way the picker can only
 * ever reach accounts this visitor already authenticated against — if they
 * later gain an account at a third studio, this token cannot reach it.
 */
export async function createStudioChoice(userIds: string[]): Promise<string> {
  const token = generateToken();

  await db.verificationToken.create({
    data: {
      // The row needs an owner; the full candidate set lives in the payload.
      userId: userIds[0],
      tokenHash: hashToken(token),
      purpose: "STUDIO_CHOICE",
      payload: { userIds },
      expiresAt: new Date(Date.now() + STUDIO_CHOICE_TTL_MINUTES * 60_000),
    },
  });

  return token;
}

/** The accounts a choice token may still pick between, or null if it is spent. */
export async function resolveStudioChoice(token: string) {
  const record = await db.verificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });

  if (
    !record ||
    record.purpose !== "STUDIO_CHOICE" ||
    record.usedAt ||
    record.expiresAt < new Date()
  ) {
    return null;
  }

  const userIds = (record.payload as { userIds?: string[] } | null)?.userIds ?? [];
  if (userIds.length === 0) return null;

  // Deactivated between issuing and choosing? Then it is no longer on offer.
  const users = await db.user.findMany({
    where: { id: { in: userIds }, isActive: true },
    include: { studio: true },
    orderBy: { studio: { name: "asc" } },
  });

  return users.length > 0 ? { record, users } : null;
}

/** Single use, same as every other token here. */
export async function consumeStudioChoice(recordId: string) {
  await db.verificationToken.update({
    where: { id: recordId },
    data: { usedAt: new Date() },
  });
}
