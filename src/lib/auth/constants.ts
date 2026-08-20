// Kept dependency-free: the middleware (edge runtime) imports this.
export const SESSION_COOKIE = "temppo_session";
export const SESSION_TTL_DAYS = 30;
export const MAGIC_LINK_TTL_MINUTES = 15;
// The studio picker is a hand-off inside one sitting, not something to
// come back to later, so it expires well before a magic link would.
export const STUDIO_CHOICE_TTL_MINUTES = 10;
