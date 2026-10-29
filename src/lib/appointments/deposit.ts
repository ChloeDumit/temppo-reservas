import type { DepositType } from "@/generated/prisma/enums";

/** The seña for a price. Pure, so the booking page can show it before asking. */
export function depositFor(type: DepositType, value: number, priceCents: number) {
  if (type === "PERCENT") return Math.round((priceCents * Math.min(100, Math.max(0, value))) / 100);
  if (type === "FIXED") return Math.min(Math.max(0, value), priceCents);
  return 0;
}

/**
 * What a client adds to a deposit paid by Mercado Pago when the studio passes
 * the fee on. Mercado Pago takes its rate from the whole charge, surcharge
 * included, so the total is grossed up until the studio is left with the
 * deposit: total = deposit / (1 − rate). Pure, so the booking page can show it.
 */
export function onlineSurchargeFor(depositCents: number, studio: { mpFeePassedOn: boolean; mpFeeBps: number }) {
  if (!studio.mpFeePassedOn || depositCents <= 0) return 0;
  const bps = Math.min(Math.max(0, studio.mpFeeBps), MAX_MP_FEE_BPS);
  if (bps === 0) return 0;
  return Math.ceil((depositCents * 10_000) / (10_000 - bps)) - depositCents;
}

/** No Mercado Pago rate is near this; it keeps a typo from tripling a deposit. */
export const MAX_MP_FEE_BPS = 2000;
