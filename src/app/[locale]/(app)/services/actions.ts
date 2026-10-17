"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { parseMoneyToCents } from "@/lib/money";

export type ActionState = { error?: string; ok?: boolean } | null;

const PAGE = "/[locale]/(app)/services";

const optionalInt = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number().int().min(0).max(100_000).optional(),
);

const serviceSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional(),
  categoryId: z.string().optional(),
  durationMin: z.coerce.number().int().min(5).max(12 * 60),
  price: z.string(),
  depositType: z.enum(["NONE", "PERCENT", "FIXED"]),
  depositValue: z.string().optional(),
  bufferBeforeMin: z.coerce.number().int().min(0).max(240),
  bufferAfterMin: z.coerce.number().int().min(0).max(240),
  rebookAfterDays: optionalInt,
});

export async function saveServiceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertAdmin();
  const parsed = serviceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "generic" };
  const v = parsed.data;

  const priceCents = parseMoneyToCents(v.price);
  if (priceCents === null) return { error: "priceInvalid" };

  // A percentage is typed as a whole number; a fixed deposit as money.
  let depositValue = 0;
  if (v.depositType === "PERCENT") {
    depositValue = Number(v.depositValue);
    if (!Number.isInteger(depositValue) || depositValue < 1 || depositValue > 100) return { error: "depositInvalid" };
  } else if (v.depositType === "FIXED") {
    const cents = parseMoneyToCents(v.depositValue ?? "");
    if (cents === null || cents <= 0 || cents > priceCents) return { error: "depositInvalid" };
    depositValue = cents;
  }

  const categoryId =
    v.categoryId && (await db.serviceCategory.findFirst({ where: { id: v.categoryId, studioId: user.studioId } }))
      ? v.categoryId
      : null;

  // Only professionals of this studio; none ticked means everyone offers it.
  const staffIds = formData.getAll("staffIds").map(String);
  const staff = staffIds.length
    ? await db.user.findMany({
        where: { id: { in: staffIds }, studioId: user.studioId, role: { in: ["OWNER", "ADMIN", "INSTRUCTOR"] } },
        select: { id: true },
      })
    : [];

  const data = {
    name: v.name,
    description: v.description || null,
    categoryId,
    durationMin: v.durationMin,
    priceCents,
    depositType: v.depositType,
    depositValue,
    bufferBeforeMin: v.bufferBeforeMin,
    bufferAfterMin: v.bufferAfterMin,
    rebookAfterDays: v.rebookAfterDays ?? null,
  };

  let id = v.id;
  if (id) {
    const existing = await db.service.findFirst({ where: { id, studioId: user.studioId } });
    if (!existing) return { error: "notFound" };
    // Appointments already booked keep the name, price and length they had.
    await db.service.update({ where: { id }, data });
  } else {
    const position = await db.service.count({ where: { studioId: user.studioId } });
    id = (await db.service.create({ data: { ...data, studioId: user.studioId, position } })).id;
  }

  const serviceId = id;
  await db.$transaction([
    db.serviceStaff.deleteMany({ where: { serviceId, staffId: { notIn: staff.map((s) => s.id) } } }),
    ...staff.map((s) =>
      db.serviceStaff.upsert({
        where: { serviceId_staffId: { serviceId, staffId: s.id } },
        create: { serviceId, staffId: s.id },
        update: {},
      }),
    ),
  ]);

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: v.id ? "service.update" : "service.create",
    entityType: "Service",
    entityId: serviceId,
    metadata: { name: v.name, priceCents, durationMin: v.durationMin },
  });

  revalidatePath(PAGE, "page");
  return { ok: true };
}

export async function toggleServiceAction(formData: FormData) {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const service = await db.service.findFirst({ where: { id, studioId: user.studioId } });
  if (!service) return;
  await db.service.update({ where: { id }, data: { isActive: !service.isActive } });
  revalidatePath(PAGE, "page");
}

const categorySchema = z.object({ name: z.string().trim().min(1).max(60) });

export async function createCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertAdmin();
  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "generic" };
  const position = await db.serviceCategory.count({ where: { studioId: user.studioId } });
  await db.serviceCategory.create({ data: { studioId: user.studioId, name: parsed.data.name, position } });
  revalidatePath(PAGE, "page");
  return { ok: true };
}

export async function deleteCategoryAction(formData: FormData) {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  // Its services stay, uncategorised, rather than disappearing with it.
  await db.serviceCategory.deleteMany({ where: { id, studioId: user.studioId } });
  revalidatePath(PAGE, "page");
}

const addOnSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(80),
  serviceId: z.string().optional(),
  durationMin: z.coerce.number().int().min(0).max(240),
  price: z.string(),
});

export async function saveAddOnAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertAdmin();
  const parsed = addOnSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "generic" };
  const v = parsed.data;
  const priceCents = parseMoneyToCents(v.price || "0");
  if (priceCents === null) return { error: "priceInvalid" };

  const serviceId =
    v.serviceId && (await db.service.findFirst({ where: { id: v.serviceId, studioId: user.studioId } }))
      ? v.serviceId
      : null;
  const data = { name: v.name, serviceId, durationMin: v.durationMin, priceCents };

  if (v.id) {
    const existing = await db.addOn.findFirst({ where: { id: v.id, studioId: user.studioId } });
    if (!existing) return { error: "notFound" };
    await db.addOn.update({ where: { id: v.id }, data });
  } else {
    await db.addOn.create({ data: { ...data, studioId: user.studioId } });
  }
  revalidatePath(PAGE, "page");
  return { ok: true };
}

export async function toggleAddOnAction(formData: FormData) {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const addOn = await db.addOn.findFirst({ where: { id, studioId: user.studioId } });
  if (!addOn) return;
  await db.addOn.update({ where: { id }, data: { isActive: !addOn.isActive } });
  revalidatePath(PAGE, "page");
}
