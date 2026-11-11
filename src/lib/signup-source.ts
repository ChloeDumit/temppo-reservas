/*
  Where a business came from when it signed up: the ad's utm_* kept, first
  touch, in a cookie by the Meta pixel component and saved on the studio.
*/

/**
 * The «Temppo Beauty Web» pixel in Meta's Events Manager. Public by design.
 * (Not «Temppo Reservas», 1023600277182281: that one is an app dataset, and
 * a web page's events sent to it are silently dropped.)
 */
export const META_PIXEL_ID = "1959477018361862";

export const SOURCE_COOKIE = "temppo_src";
/** Set for a few minutes after a sign-up, so the pixel counts it once. */
export const SIGNUP_COOKIE = "temppo_signup";

/** «meta · paid · lanzamiento-nov (11/11)», or «directo» when no ad brought her. */
export function signupSourceLabel(raw: string | null | undefined) {
  if (!raw) return "directo (sin anuncio)";
  try {
    const v = JSON.parse(raw) as { source?: string; medium?: string | null; campaign?: string | null; at?: string | null };
    return [v.source, v.medium, v.campaign].filter(Boolean).join(" · ") + (v.at ? ` (${v.at})` : "");
  } catch {
    return "directo (sin anuncio)";
  }
}
