import "server-only";
import { db } from "@/lib/db";
import { generateToken } from "@/lib/auth/tokens";
import { notifyPreferred } from "@/lib/notifications";

type StudioLike = {
  id: string;
  name: string;
  timezone: string;
  locale: string;
  waitlistClaimWindowMins: number;
};

/** Spots taken right now (a cancelled booking frees its seat immediately). */
async function seatsTaken(classInstanceId: string) {
  return db.booking.count({
    where: { classInstanceId, status: { in: ["BOOKED", "ATTENDED"] } },
  });
}

export async function joinWaitlist(params: {
  studioId: string;
  classInstanceId: string;
  studentId: string;
}) {
  const { studioId, classInstanceId, studentId } = params;

  const existing = await db.waitlistEntry.findUnique({
    where: { classInstanceId_studentId: { classInstanceId, studentId } },
  });

  if (existing && ["WAITING", "OFFERED"].includes(existing.status)) {
    return { ok: true as const, entry: existing, alreadyOn: true };
  }

  const last = await db.waitlistEntry.findFirst({
    where: { classInstanceId },
    orderBy: { position: "desc" },
  });
  const position = (last?.position ?? 0) + 1;

  const entry = existing
    ? await db.waitlistEntry.update({
        where: { id: existing.id },
        data: { status: "WAITING", position, offeredAt: null, offerExpiresAt: null, claimToken: null },
      })
    : await db.waitlistEntry.create({
        data: { studioId, classInstanceId, studentId, position, status: "WAITING" },
      });

  return { ok: true as const, entry, alreadyOn: false };
}

export async function leaveWaitlist(params: { classInstanceId: string; studentId: string }) {
  await db.waitlistEntry.updateMany({
    where: {
      classInstanceId: params.classInstanceId,
      studentId: params.studentId,
      status: { in: ["WAITING", "OFFERED"] },
    },
    data: { status: "CANCELLED" },
  });
}

/**
 * Offers a freed spot to the next person in line and starts their claim clock.
 * Only one offer is live at a time, so two people can't claim the same seat.
 * Returns the entry that was offered, or null if there was nobody (or no room).
 */
export async function offerNextSpot(params: {
  studio: StudioLike;
  classInstanceId: string;
  now?: Date;
}) {
  const { studio, classInstanceId } = params;
  const now = params.now ?? new Date();

  const instance = await db.classInstance.findFirst({
    where: { id: classInstanceId, studioId: studio.id },
  });
  if (!instance || instance.status === "CANCELLED") return null;
  if (instance.startsAt.getTime() <= now.getTime()) return null;

  // Someone already holds a live offer — let their window run out first.
  const liveOffer = await db.waitlistEntry.findFirst({
    where: {
      classInstanceId,
      status: "OFFERED",
      offerExpiresAt: { gt: now },
    },
  });
  if (liveOffer) return null;

  const taken = await seatsTaken(classInstanceId);
  if (taken >= instance.capacity) return null;

  const next = await db.waitlistEntry.findFirst({
    where: { classInstanceId, status: "WAITING" },
    orderBy: { position: "asc" },
    include: { student: { include: { user: true } } },
  });
  if (!next) return null;

  const claimToken = generateToken();
  const offerExpiresAt = new Date(now.getTime() + studio.waitlistClaimWindowMins * 60_000);

  await db.waitlistEntry.update({
    where: { id: next.id },
    data: { status: "OFFERED", offeredAt: now, offerExpiresAt, claimToken },
  });

  const base = process.env.APP_URL || "http://localhost:3000";
  const link = `${base}/api/waitlist/claim?token=${claimToken}&locale=${studio.locale}`;
  const when = new Intl.DateTimeFormat(studio.locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: studio.timezone,
  }).format(instance.startsAt);

  await notifyPreferred({
    studioId: studio.id,
    to: next.student.user.email,
    phone: next.student.user.phone,
    userId: next.student.userId,
    url: "/my",
    template: "waitlist_offer",
    subject: `${studio.name} — se liberó un lugar`,
    body:
      studio.locale === "en"
        ? `Hi ${next.student.user.name}, a spot opened up in ${instance.name} (${when}). Claim it within ${studio.waitlistClaimWindowMins} minutes: ${link}`
        : `Hola ${next.student.user.name}, se liberó un lugar en ${instance.name} (${when}). Confirmá en los próximos ${studio.waitlistClaimWindowMins} minutos: ${link}`,
    relatedType: "WaitlistEntry",
    relatedId: next.id,
  });

  return next;
}

/**
 * Expires offers whose window has closed and passes each spot down the line.
 * Safe to call often — it only touches entries that have actually run out.
 */
export async function sweepExpiredOffers(studio: StudioLike, now = new Date()) {
  const expired = await db.waitlistEntry.findMany({
    where: {
      studioId: studio.id,
      status: "OFFERED",
      offerExpiresAt: { lte: now },
    },
    select: { id: true, classInstanceId: true },
  });

  if (expired.length === 0) return 0;

  await db.waitlistEntry.updateMany({
    where: { id: { in: expired.map((e) => e.id) } },
    data: { status: "EXPIRED", claimToken: null },
  });

  // One offer per class, so de-dupe before passing spots along.
  const classIds = [...new Set(expired.map((e) => e.classInstanceId))];
  for (const classInstanceId of classIds) {
    await offerNextSpot({ studio, classInstanceId, now });
  }

  return expired.length;
}

export type WaitlistPosition = { position: number; total: number } | null;

/** 1-based place in the queue, counting only people still waiting ahead. */
export async function waitlistPositionFor(classInstanceId: string, studentId: string) {
  const entry = await db.waitlistEntry.findUnique({
    where: { classInstanceId_studentId: { classInstanceId, studentId } },
  });
  if (!entry || !["WAITING", "OFFERED"].includes(entry.status)) return null;

  const ahead = await db.waitlistEntry.count({
    where: {
      classInstanceId,
      status: { in: ["WAITING", "OFFERED"] },
      position: { lt: entry.position },
    },
  });

  return { position: ahead + 1, entryId: entry.id, status: entry.status };
}
