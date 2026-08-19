import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * The app is served from a sub-path in production (temppo.uy/reservas) while
 * running at the root in development. Set BASE_PATH in the deploy environment;
 * Next then prefixes every route, asset and Server Action URL for us.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  // Assets must resolve through the same prefix when proxied behind Netlify.
  assetPrefix: basePath || undefined,
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
