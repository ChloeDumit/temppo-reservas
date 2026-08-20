import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/auth/tokens";
import { createSession } from "@/lib/auth/session";
import { createStudioChoice } from "@/lib/auth/studio-choice";
import { recordAudit } from "@/lib/audit";
import { routing, localePath } from "@/i18n/routing";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const requested = request.nextUrl.searchParams.get("locale") ?? routing.defaultLocale;
  const locale = routing.locales.includes(requested as never)
    ? requested
    : routing.defaultLocale;

  const fail = () =>
    NextResponse.redirect(new URL(localePath(locale, "/login?error=magic"), request.url));

  if (!token) return fail();

  const record = await db.verificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (
    !record ||
    record.purpose !== "MAGIC_LINK" ||
    record.usedAt ||
    record.expiresAt < new Date() ||
    !record.user.isActive
  ) {
    return fail();
  }

  // Single use.
  await db.verificationToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });

  // The click proves control of the address, which may cover an account at
  // several studios. The token is only anchored to one of them, so expand.
  const accounts = await db.user.findMany({
    where: { email: record.user.email, isActive: true },
    select: { id: true },
  });

  if (accounts.length > 1) {
    const choice = await createStudioChoice(accounts.map((account) => account.id));
    return NextResponse.redirect(
      new URL(localePath(locale, `/login/studio?token=${choice}`), request.url),
    );
  }

  await createSession(record.userId, {
    userAgent: request.headers.get("user-agent"),
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });

  await recordAudit({
    studioId: record.user.studioId,
    actorId: record.userId,
    actorLabel: record.user.name,
    action: "auth.magic_link",
    entityType: "User",
    entityId: record.userId,
  });

  const destination = record.user.role === "STUDENT" ? "/my" : "/dashboard";
  return NextResponse.redirect(new URL(localePath(locale, destination), request.url));
}
