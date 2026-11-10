import "server-only";
import { db } from "@/lib/db";
import { normalizeCode } from "@/lib/coupon-math";

export { discountFor, normalizeCode } from "@/lib/coupon-math";

/*
  Discount codes a business gives its clients: a percentage off, on all of
  its services (Temppo Beauty) or packs (TEMPPO Reservas) or only some,
  between two dates. Checked when she types it and again when she books or
  pays, so a code that lapsed in between is never applied.
*/

export type CouponProblem = "notFound" | "notYet" | "expired" | "notForThis";

export type ValidCoupon = { id: string; code: string; percentOff: number };

/**
 * The studio's active coupon by this code, if it applies to this service or
 * pack right now; otherwise why not.
 */
export async function checkCoupon(
  studioId: string,
  rawCode: string,
  target: { serviceId?: string; packId?: string },
  now = new Date(),
): Promise<{ coupon: ValidCoupon } | { problem: CouponProblem }> {
  const code = normalizeCode(rawCode);
  if (!code) return { problem: "notFound" };
  const coupon = await db.coupon.findUnique({ where: { studioId_code: { studioId, code } } });
  if (!coupon || !coupon.isActive) return { problem: "notFound" };
  if (coupon.validFrom && now < coupon.validFrom) return { problem: "notYet" };
  if (coupon.validUntil && now > coupon.validUntil) return { problem: "expired" };
  if (target.serviceId && coupon.serviceIds.length && !coupon.serviceIds.includes(target.serviceId)) return { problem: "notForThis" };
  if (target.packId && coupon.packIds.length && !coupon.packIds.includes(target.packId)) return { problem: "notForThis" };
  return { coupon: { id: coupon.id, code: coupon.code, percentOff: coupon.percentOff } };
}

/** The message for a code that does not apply, in the client's language. */
export function couponProblemText(problem: CouponProblem, en: boolean) {
  const es = {
    notFound: "Ese cupón no existe. Revisá cómo está escrito.",
    notYet: "Ese cupón todavía no está vigente.",
    expired: "Ese cupón ya venció.",
    notForThis: "Ese cupón no vale para lo que elegiste.",
  };
  const eng = {
    notFound: "That coupon does not exist. Check how it is spelled.",
    notYet: "That coupon is not valid yet.",
    expired: "That coupon has expired.",
    notForThis: "That coupon does not apply to this.",
  };
  return (en ? eng : es)[problem];
}
