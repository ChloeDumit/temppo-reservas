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
  /**
   * The browser's language does not decide.
   *
   * Accept-Language negotiation sent anyone with an English-configured browser
   * to /en, which in this market is a great many people who nonetheless speak
   * Spanish and arrived from a Spanish page. An unprefixed URL now always
   * lands on Spanish, and the ES/EN switch stays one tap away — it writes the
   * locale into the path, so choosing English still works and still sticks for
   * as long as the visitor stays on prefixed links.
   */
  localeDetection: false,
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
