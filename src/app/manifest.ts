import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { getBrand } from "@/lib/brand/server";

/**
 * Installable on iOS and Android straight from the browser — "Add to home
 * screen" gives a standalone, chrome-less app pointing at the studio dashboard.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const brand = await getBrand();
  return {
    name: brand.name,
    short_name: brand.shortName,
    description:
      brand.key === "temppo"
        ? "Gestión de reservas, alumnos y pagos para estudios de pilates, yoga y fitness."
        : brand.description,
    // Locale-prefixed: routing always carries a prefix, so an unprefixed
    // start_url would cost a redirect on every launch of the installed app.
    // Staff land on the dashboard; students are forwarded to their own screen.
    start_url: `/${routing.defaultLocale}/dashboard`,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: brand.background,
    theme_color: brand.themeColor,
    lang: "es",
    categories: ["business", "productivity", "health"],
    icons: [
      { src: `${brand.iconBase}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${brand.iconBase}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${brand.iconBase}/icon-maskable.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
