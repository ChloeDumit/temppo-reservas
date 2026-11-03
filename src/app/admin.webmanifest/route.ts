import { NextResponse } from "next/server";
import { routing } from "@/i18n/routing";
import { getBrand } from "@/lib/brand/server";

/**
 * The platform console's own manifest. Added to a phone's home screen from a
 * console page, it opens the console, not a studio's dashboard, and is named
 * apart from the app so the two icons can sit side by side.
 */
export async function GET() {
  const brand = await getBrand();
  return NextResponse.json(
    {
      id: "/admin",
      name: "Temppo Consola",
      short_name: "Consola",
      description: "La consola de la plataforma: negocios, cobros, contenido y WhatsApp.",
      start_url: `/${routing.defaultLocale}/admin`,
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#1c1917",
      theme_color: "#1c1917",
      lang: "es",
      icons: [
        { src: `${brand.iconBase}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: `${brand.iconBase}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: `${brand.iconBase}/icon-maskable.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
