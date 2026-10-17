/**
 * What Temppo Beauty costs, as shown on its landing page. Monthly, in pesos
 * uruguayos, every feature on every plan — the plans differ only in how many
 * professionals and locations they cover.
 *
 * Display only for now: studios are not billed through the app yet (see
 * BILLING_UI_ENABLED), and the limits below are not enforced.
 */
export type BeautyPlan = {
  key: "solo" | "team" | "salon";
  priceUyu: number;
  /** null = unlimited */
  professionals: number | null;
  locations: number | null;
};

export const BEAUTY_PLANS: BeautyPlan[] = [
  { key: "solo", priceUyu: 790, professionals: 1, locations: 1 },
  { key: "team", priceUyu: 1490, professionals: 4, locations: 1 },
  { key: "salon", priceUyu: 2490, professionals: null, locations: null },
];

export const BEAUTY_TRIAL_DAYS = 30;
