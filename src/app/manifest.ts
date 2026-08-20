import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

/**
 * Installable on iOS and Android straight from the browser — "Add to home
 * screen" gives a standalone, chrome-less app pointing at the studio dashboard.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TEMPPO Reservas",
    short_name: "TEMPPO",
    description:
      "Gestión de reservas, alumnos y pagos para estudios de pilates, yoga y fitness.",
    // Locale-prefixed: routing always carries a prefix, so an unprefixed
    // start_url would cost a redirect on every launch of the installed app.
    // Staff land on the dashboard; students are forwarded to their own screen.
    start_url: `/${routing.defaultLocale}/dashboard`,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf8f5",
    theme_color: "#c0563c",
    lang: "es",
    categories: ["business", "productivity", "health"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
