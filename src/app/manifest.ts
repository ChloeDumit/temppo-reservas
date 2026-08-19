import type { MetadataRoute } from "next";

/**
 * Installable on iOS and Android straight from the browser — "Add to home
 * screen" gives a standalone, chrome-less app pointing at the studio dashboard.
 */
export default function manifest(): MetadataRoute.Manifest {
  // Everything the manifest points at must carry the deployment's sub-path,
  // otherwise an installed PWA launches at the wrong origin path.
  const base = process.env.NEXT_PUBLIC_BASE_PATH || "";

  return {
    name: "TEMPPO Reservas",
    short_name: "TEMPPO",
    description:
      "Gestión de reservas, alumnos y pagos para estudios de pilates, yoga y fitness.",
    start_url: `${base}/dashboard`,
    scope: `${base}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf8f5",
    theme_color: "#c0563c",
    lang: "es",
    categories: ["business", "productivity", "health"],
    icons: [
      { src: `${base}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${base}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${base}/icon-maskable.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
