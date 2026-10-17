import { brandByKey } from "./registry";

/**
 * Base URL for links that leave the app — emails, payment returns, WhatsApp
 * texts. A studio's links must point at its own brand's domain, whatever host
 * happened to trigger the send (a cron job has no host at all).
 */
export function appUrlFor(studio: { brand?: string | null }) {
  const brand = brandByKey(studio.brand);
  if (brand.key !== "temppo" && brand.domains[0] && process.env.NODE_ENV === "production") {
    return `https://${brand.domains[0]}`;
  }
  return process.env.APP_URL || "http://localhost:3000";
}
