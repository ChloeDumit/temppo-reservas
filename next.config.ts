import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/*
  The app is served from the root of its own domain (reservas.temppo.uy).

  There is deliberately no basePath here. Serving from temppo.uy/reservas was
  tried and dropped — the bare prefix never resolved without a trailing slash,
  and the proxy in front of it turned the app's redirects into 404s. Because
  NEXT_PUBLIC_* values are inlined at build time, a stale prefix also survived
  an env-var change and kept 404ing until the site was rebuilt. Keeping the
  option around invited that failure back, so it is gone.
*/
const nextConfig: NextConfig = {
  /**
   * Hosts allowed to pull dev assets (JS chunks, HMR) from `next dev`.
   *
   * Without these, opening the app on a phone — over the LAN or through a
   * tunnel — serves the HTML but blocks every script, so the page arrives
   * dead. Development only; production builds ignore this.
   */
  allowedDevOrigins: [
    "*.trycloudflare.com",
    "*.ngrok-free.app",
    "*.ngrok.io",
    "*.loca.lt",
    // Local network, for testing over Wi-Fi without a tunnel.
    "192.168.*.*",
    "10.*.*.*",
  ],
  experimental: {
    // Server Actions receive uploaded proof-of-payment images.
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default withNextIntl(nextConfig);
