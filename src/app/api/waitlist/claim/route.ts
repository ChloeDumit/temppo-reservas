import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { bookClass } from "@/lib/booking";
import { offerNextSpot } from "@/lib/waitlist";
import { recordAudit } from "@/lib/audit";
import { routing, localePath } from "@/i18n/routing";

/**
 * The link from a "a spot opened up" message. Claims the seat if the window is
 * still open; otherwise the spot has already moved on to the next student.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const requested = request.nextUrl.searchParams.get("locale") ?? routing.defaultLocale;
  const locale = routing.locales.includes(requested as never) ? requested : routing.defaultLocale;

  const back = (status: string) =>
    NextResponse.redirect(new URL(localePath(locale, `/my?waitlist=${status}`), request.url));

  if (!token) return back("invalid");

  const entry = await db.waitlistEntry.findUnique({
    where: { claimToken: token },
    include: { student: { include: { user: true } }, studio: true },
  });

  if (!entry || entry.status !== "OFFERED") return back("invalid");

  if (!entry.offerExpiresAt || entry.offerExpiresAt < new Date()) {
    await db.waitlistEntry.update({
      where: { id: entry.id },
      data: { status: "EXPIRED", claimToken: null },
    });
    // Hand the spot to whoever is next rather than letting it sit empty.
    await offerNextSpot({ studio: entry.studio, classInstanceId: entry.classInstanceId });
    return back("expired");
  }

  // Claiming requires being signed in as the student who was offered the spot.
  const user = await getCurrentUser();
  if (!user || user.studentProfile?.id !== entry.studentId) {
    const next = localePath(locale, `/api/waitlist/claim?token=${token}&locale=${locale}`);
    return NextResponse.redirect(
      new URL(localePath(locale, `/login?next=${encodeURIComponent(next)}`), request.url),
    );
  }

  const result = await bookClass({
    studio: entry.studio,
    studentId: entry.studentId,
    classInstanceId: entry.classInstanceId,
    source: "WAITLIST",
    bypassWindow: true,
  });

  if (!result.ok) {
    if (result.code === "CLASS_FULL") {
      await db.waitlistEntry.update({
        where: { id: entry.id },
        data: { status: "WAITING", offeredAt: null, offerExpiresAt: null, claimToken: null },
      });
      return back("full");
    }
    return back(result.code === "NO_CREDITS" ? "nocredits" : "invalid");
  }

  // bookClass already flips the entry to CLAIMED; clear the spent token.
  await db.waitlistEntry.update({
    where: { id: entry.id },
    data: { status: "CLAIMED", claimToken: null },
  });

  await recordAudit({
    studioId: entry.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "waitlist.claim",
    entityType: "WaitlistEntry",
    entityId: entry.id,
    metadata: { classInstanceId: entry.classInstanceId },
  });

  return back("claimed");
}
