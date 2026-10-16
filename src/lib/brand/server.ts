import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { BRANDS, brandByKey, brandForHost, isBrandKey, type Brand } from "./registry";

/**
 * Lets one machine show either brand. Production decides by host alone; in
 * development (or a preview with BRAND_OVERRIDE=1) `?brand=beauty` on any URL
 * stores this cookie and the rest of the visit follows it.
 */
export const BRAND_COOKIE = "brand_override";

export function brandOverrideAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.BRAND_OVERRIDE === "1";
}

/** The brand of the current request. */
export const getBrand = cache(async (): Promise<Brand> => {
  if (brandOverrideAllowed()) {
    const forced = (await cookies()).get(BRAND_COOKIE)?.value ?? process.env.DEV_BRAND;
    if (isBrandKey(forced)) return BRANDS[forced];
  }
  const h = await headers();
  return brandForHost(h.get("x-forwarded-host") ?? h.get("host"));
});

export { brandByKey };
