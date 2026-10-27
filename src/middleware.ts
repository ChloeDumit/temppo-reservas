import createIntlMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing, localePath } from "@/i18n/routing";
import { SESSION_COOKIE, SUPPORT_COOKIE } from "@/lib/auth/constants";

const BRAND_COOKIE = "brand_override";
const BRAND_OVERRIDE_ALLOWED = process.env.NODE_ENV !== "production" || process.env.BRAND_OVERRIDE === "1";

const intlMiddleware = createIntlMiddleware(routing);

// Segments that require a session. The cookie is only checked for presence here —
// middleware runs on the edge and cannot reach the database. Real authorization
// happens in the server components behind these routes.
const PROTECTED = ["/dashboard", "/schedule", "/students", "/packs", "/payments", "/settings", "/classes", "/my", "/checkin", "/buy", "/leads", "/reports", "/availability", "/admin", "/suspended", "/password", "/agenda", "/services", "/clients", "/hours", "/appointments"];

/** Splits "/es/schedule" into its locale and the route beneath it. */
function splitLocale(pathname: string) {
  const segments = pathname.split("/");
  if (routing.locales.includes(segments[1] as never)) {
    return { locale: segments[1], path: "/" + segments.slice(2).join("/") };
  }
  return { locale: routing.defaultLocale, path: pathname };
}

export default function middleware(request: NextRequest) {
  const { locale, path } = splitLocale(request.nextUrl.pathname);

  if (PROTECTED.some((p) => path === p || path.startsWith(p + "/"))) {
    if (!request.cookies.get(SESSION_COOKIE) && !request.cookies.get(SUPPORT_COOKIE)) {
      // Keep the visitor's locale on the way to the login screen, and send
      // them somewhere that exists — an unprefixed /login would just bounce
      // through the intl middleware for a second round trip.
      const url = new URL(localePath(locale, "/login"), request.url);
      url.searchParams.set("next", request.nextUrl.pathname);
      return NextResponse.redirect(url);
    }
  }

  // `?brand=beauty` while developing: stored in a cookie and the param
  // dropped with a redirect, so the page that renders already sees it and
  // every later link keeps the same brand. `?brand=` with no value clears it.
  const forced = request.nextUrl.searchParams.get("brand");
  if (BRAND_OVERRIDE_ALLOWED && forced !== null) {
    const clean = request.nextUrl.clone();
    clean.searchParams.delete("brand");
    const response = NextResponse.redirect(clean);
    if (forced) response.cookies.set(BRAND_COOKIE, forced, { path: "/", sameSite: "lax" });
    else response.cookies.delete(BRAND_COOKIE);
    return response;
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
