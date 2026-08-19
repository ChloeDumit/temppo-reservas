import createIntlMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "@/i18n/routing";
import { SESSION_COOKIE } from "@/lib/auth/constants";

const intlMiddleware = createIntlMiddleware(routing);

// Segments that require a session. The cookie is only checked for presence here —
// middleware runs on the edge and cannot reach the database. Real authorization
// happens in the server components behind these routes.
const PROTECTED = ["/dashboard", "/schedule", "/students", "/packs", "/payments", "/settings", "/classes", "/my", "/checkin", "/buy", "/leads", "/reports", "/availability"];

function stripLocale(pathname: string) {
  const segments = pathname.split("/");
  if (routing.locales.includes(segments[1] as never)) {
    return "/" + segments.slice(2).join("/");
  }
  return pathname;
}

export default function middleware(request: NextRequest) {
  const path = stripLocale(request.nextUrl.pathname);

  if (PROTECTED.some((p) => path === p || path.startsWith(p + "/"))) {
    if (!request.cookies.get(SESSION_COOKIE)) {
      const url = new URL("/login", request.url);
      url.searchParams.set("next", request.nextUrl.pathname);
      return NextResponse.redirect(url);
    }
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
