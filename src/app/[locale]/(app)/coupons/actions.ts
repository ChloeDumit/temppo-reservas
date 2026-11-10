"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { wallTimeToUtc } from "@/lib/dates";
import { normalizeCode } from "@/lib/coupon-math";

const PAGE = "/[locale]/(app)/coupons";

export type CouponState = { ok?: boolean; message?: string } | null;

/*
  Answered in place, never by redirecting back to the page: a redirect from
  an action reloaded the screen and, on a phone, could leave it blank — the
  coupon saved, nothing shown.
*/
const fail = (message: string): CouponState => ({ ok: false, message });
const done = (message: string): CouponState => {
  revalidatePath(PAGE, "page");
  return { ok: true, message };
};

const createSchema = z.object({
  code: z.string().trim().min(3).max(20),
  percentOff: z.coerce.number().int().min(1).max(100),
  from: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  until: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
});

/** A new discount code. Dates are whole days, studio time. */
export async function createCouponAction(_prev: CouponState, formData: FormData): Promise<CouponState> {
  const user = await assertAdmin();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Revisá el cupón: un código de 3 a 20 letras o números y un descuento entre 1 y 100 %.");
  const code = normalizeCode(parsed.data.code);
  if (!/^[A-Z0-9_-]+$/.test(code)) return fail("El código solo puede tener letras, números, guiones.");

  const tz = user.studio.timezone;
  const validFrom = parsed.data.from ? wallTimeToUtc(parsed.data.from, "00:00", tz) : null;
  const validUntil = parsed.data.until ? new Date(wallTimeToUtc(parsed.data.until, "23:59", tz).getTime() + 59_999) : null;
  if (validFrom && validUntil && validUntil < validFrom) return fail("La fecha de fin es anterior a la de inicio.");

  // Only ids that are the studio's own.
  const beauty = user.studio.vertical === "APPOINTMENTS";
  const picked = formData.getAll("targets").map(String);
  const own = beauty
    ? (await db.service.findMany({ where: { studioId: user.studioId, id: { in: picked } }, select: { id: true } })).map((s) => s.id)
    : (await db.classPack.findMany({ where: { studioId: user.studioId, id: { in: picked } }, select: { id: true } })).map((p) => p.id);

  const exists = await db.coupon.findUnique({ where: { studioId_code: { studioId: user.studioId, code } } });
  if (exists) return fail(`Ya tenés un cupón ${code}. Elegí otro código.`);

  const coupon = await db.coupon.create({
    data: {
      studioId: user.studioId,
      code,
      percentOff: parsed.data.percentOff,
      ...(beauty ? { serviceIds: own } : { packIds: own }),
      validFrom,
      validUntil,
    },
  });
  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "coupon.create",
    entityType: "Coupon",
    entityId: coupon.id,
    metadata: { code, percentOff: parsed.data.percentOff, only: own.length },
  });
  return done(`Cupón ${code} creado: compartilo con tus clientas.`);
}

/** On and off: an inactive code is refused, and can be turned back on. */
export async function toggleCouponAction(formData: FormData): Promise<void> {
  const user = await assertAdmin();
  const coupon = await db.coupon.findFirst({ where: { id: String(formData.get("id") ?? ""), studioId: user.studioId } });
  if (!coupon) return;
  await db.coupon.update({ where: { id: coupon.id }, data: { isActive: !coupon.isActive } });
  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: coupon.isActive ? "coupon.deactivate" : "coupon.activate",
    entityType: "Coupon",
    entityId: coupon.id,
  });
  revalidatePath(PAGE, "page");
}

/** Gone for good. Bookings and payments that used it keep its code. */
export async function deleteCouponAction(formData: FormData): Promise<void> {
  const user = await assertAdmin();
  const coupon = await db.coupon.findFirst({ where: { id: String(formData.get("id") ?? ""), studioId: user.studioId } });
  if (!coupon) return;
  await db.coupon.delete({ where: { id: coupon.id } });
  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "coupon.delete",
    entityType: "Coupon",
    entityId: coupon.id,
    metadata: { code: coupon.code },
  });
  revalidatePath(PAGE, "page");
}
