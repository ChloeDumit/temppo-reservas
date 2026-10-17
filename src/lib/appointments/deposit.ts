import type { DepositType } from "@/generated/prisma/enums";

/** The seña for a price. Pure, so the booking page can show it before asking. */
export function depositFor(type: DepositType, value: number, priceCents: number) {
  if (type === "PERCENT") return Math.round((priceCents * Math.min(100, Math.max(0, value))) / 100);
  if (type === "FIXED") return Math.min(Math.max(0, value), priceCents);
  return 0;
}
