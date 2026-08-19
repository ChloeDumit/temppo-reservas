import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { markAttendance } from "@/lib/booking";
import { recordAudit } from "@/lib/audit";
import { routing } from "@/i18n/routing";

function pathFor(locale: string, path: string) {
  return locale === routing.defaultLocale ? path : `/${locale}${path}`;
}

/**
 * Target of the QR on a student's booking. Scanning it from a signed-in staff
 * device marks attendance; the kiosk page posts here too.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const user = await getCurrentUser();
  const locale = user?.studio.locale ?? routing.defaultLocale;

  const back = (status: string, name?: string) => {
    const params = new URLSearchParams({ status });
    if (name) params.set("name", name);
    return NextResponse.redirect(
      new URL(pathFor(locale, `/checkin?${params.toString()}`), request.url),
    );
  };

  if (!user) {
    const next = `/api/checkin?token=${token ?? ""}`;
    return NextResponse.redirect(
      new URL(pathFor(locale, `/login?next=${encodeURIComponent(next)}`), request.url),
    );
  }
  if (!["OWNER", "ADMIN", "INSTRUCTOR"].includes(user.role)) return back("forbidden");
  if (!token) return back("invalid");

  const booking = await db.booking.findUnique({
    where: { checkInToken: token },
    include: { student: { include: { user: true } }, classInstance: true },
  });

  // Never confirm someone else's studio.
  if (!booking || booking.studioId !== user.studioId) return back("invalid");

  const name = booking.student.user.name;
  if (booking.status === "ATTENDED") return back("already", name);
  if (booking.status === "CANCELLED" || booking.status === "LATE_CANCELLED") {
    return back("cancelled", name);
  }

  // Only accept a scan near the class time, so an early scan can't mark a
  // class that hasn't happened. Two hours either side is plenty.
  const drift = Math.abs(booking.classInstance.startsAt.getTime() - Date.now());
  if (drift > 2 * 3_600_000) return back("wrongtime", name);

  await markAttendance({ studio: user.studio, bookingId: booking.id, attended: true });

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "booking.check_in",
    entityType: "Booking",
    entityId: booking.id,
    metadata: { via: "qr", studentId: booking.studentId },
  });

  return back("ok", name);
}
