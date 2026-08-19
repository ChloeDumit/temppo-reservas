import { defineRouting } from "next-intl/routing";

export const locales = ["es", "en"] as const;
export type AppLocale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  // Spanish first: the initial market is LatAm studios.
  defaultLocale: "es",
  localePrefix: "as-needed",
});
