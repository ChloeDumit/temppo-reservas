import { NextRequest, NextResponse } from "next/server";
import { createSupportSession } from "@/lib/auth/session";
import { consumeSupportEntry } from "@/lib/auth/support";
import { routing, localePath } from "@/i18n/routing";

/**
 * Where the console sends a support visit, on the studio's own host. Trades
 * the one-use entry token for a support session and opens the studio's home.
 * The console logged the visit when the admin asked for it.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const entry = token ? await consumeSupportEntry(token) : null;
  if (!entry) {
    return NextResponse.redirect(new URL(localePath(routing.defaultLocale, "/login?error=magic"), request.url));
  }

  const { user, admin } = entry;
  await createSupportSession(user.id, admin.id, {
    userAgent: request.headers.get("user-agent"),
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });

  return NextResponse.redirect(new URL(localePath(user.studio.locale, "/dashboard"), request.url));
}
