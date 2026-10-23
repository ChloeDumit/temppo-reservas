/**
 * What Temppo Beauty costs, as shown on its landing page. Monthly, in pesos
 * uruguayos. The plans differ in how many professionals and locations they
 * cover and in how many automatic WhatsApp messages they include — the one
 * feature that costs us per use (Meta charges about US$0.011 per message to
 * Uruguay). Never by number of clients: that would charge a studio more just
 * for doing well.
 *
 * Launch pricing: the first LAUNCH_SPOTS studios keep `launchPriceUyu` for
 * LAUNCH_LOCK_MONTHS; `priceUyu` is the regular price, shown crossed out.
 *
 * Display only for now: studios are not billed through the app yet (see
 * BILLING_UI_ENABLED), and the limits below are not enforced.
 */
export type BeautyPlan = {
  key: "solo" | "team" | "salon";
  priceUyu: number;
  launchPriceUyu: number;
  /** null = unlimited */
  professionals: number | null;
  locations: number | null;
  /** Automatic WhatsApp messages a month. 0 = only the manual wa.me button. */
  waQuota: number;
};

export const BEAUTY_PLANS: BeautyPlan[] = [
  { key: "solo", priceUyu: 790, launchPriceUyu: 490, professionals: 1, locations: 1, waQuota: 0 },
  { key: "team", priceUyu: 1390, launchPriceUyu: 890, professionals: 4, locations: 1, waQuota: 300 },
  { key: "salon", priceUyu: 2490, launchPriceUyu: 1590, professionals: null, locations: null, waQuota: 800 },
];

export const LAUNCH_SPOTS = 50;
export const LAUNCH_LOCK_MONTHS = 12;

/**
 * Whether automatic WhatsApp actually sends yet. Until it does, the landing
 * marks it "coming soon" and leaves it out of what the trial promises.
 */
export const WA_AUTO_LIVE = false;

/** An extra block of automatic WhatsApp messages, on any plan that has them. */
export const WA_PACK = { messages: 200, priceUyu: 190 };

/**
 * The trial runs on the middle plan, so a studio tries automatic WhatsApp
 * before choosing — with a small quota, since each message costs us. No
 * client cap: loading their real client list is what makes them stay.
 */
export const BEAUTY_TRIAL_DAYS = 30;
export const BEAUTY_TRIAL_PLAN: BeautyPlan["key"] = "team";
export const BEAUTY_TRIAL_WA_QUOTA = 50;
