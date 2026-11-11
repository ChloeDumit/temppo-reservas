/*
  Where a business came from when it signed up: the ad's utm_* kept, first
  touch, in a cookie by the Meta pixel component and saved on the studio.
*/

/** The «Temppo Reservas» dataset in Meta's Events Manager. Public by design. */
export const META_PIXEL_ID = "1023600277182281";

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
