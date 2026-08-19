import { defineRouting } from "next-intl/routing";

export const locales = ["es", "en"] as const;
export type AppLocale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  // Spanish first: the initial market is LatAm studios.
  defaultLocale: "es",
  /**
   * Every locale carries its prefix, including the default.
   *
   * "as-needed" would give prettier Spanish URLs, but it relies on an internal
   * rewrite for the default locale, and Netlify's edge adapter turns that
   * rewrite into a redirect — which loops. Prefixing always keeps routing
   * explicit and portable across hosts.
   */
  localePrefix: "always",
});

/**
 * Absolute-path builder for links that live outside the routed tree: emails,
 * QR codes, payment return URLs. Route handlers and server actions can't use
 * next-intl's navigation helpers, so this is the one place that knows how a
 * locale becomes a URL prefix.
 */
export function localePath(locale: string, path: string) {
  const safe = (locales as readonly string[]).includes(locale)
    ? locale
    : routing.defaultLocale;

  const suffix = path.startsWith("/") ? path : `/${path}`;

  if (routing.localePrefix === "always") return `/${safe}${suffix}`;
  return safe === routing.defaultLocale ? suffix : `/${safe}${suffix}`;
}
