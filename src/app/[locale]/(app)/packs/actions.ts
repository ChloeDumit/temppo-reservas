"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { parseMoneyToCents } from "@/lib/money";

export type ActionState = { error?: string; ok?: boolean } | null;

const packSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional(),
  credits: z.coerce.number().int().min(0).max(500),
  price: z.string(),
  validityDays: z.coerce.number().int().min(1).max(730),
});

export async function savePackAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertAdmin();
  const parsed = packSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "generic" };

  const isUnlimited = formData.get("isUnlimited") === "on";
  const priceCents = parseMoneyToCents(parsed.data.price);
  if (priceCents === null) return { error: "priceInvalid" };

  const { id, name, description, credits, validityDays } = parsed.data;
  if (!isUnlimited && credits < 1) return { error: "generic" };

  const data = {
    name,
    description: description || null,
    credits: isUnlimited ? 0 : credits,
    isUnlimited,
    priceCents,
    validityDays,
  };

  if (id) {
    const existing = await db.classPack.findFirst({ where: { id, studioId: user.studioId } });
    if (!existing) return { error: "notFound" };
    // Only the definition changes — packs already sold keep their own terms.
    await db.classPack.update({ where: { id }, data });
  } else {
    await db.classPack.create({ data: { ...data, studioId: user.studioId } });
  }

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: id ? "pack.update" : "pack.create",
    entityType: "ClassPack",
    entityId: id ?? null,
    metadata: { name, priceCents },
  });

  revalidatePath("/[locale]/(app)/packs", "page");
  return { ok: true };
}

export async function togglePackAction(formData: FormData) {
  const user = await assertAdmin();
  const id = String(formData.get("id") ?? "");

  const pack = await db.classPack.findFirst({ where: { id, studioId: user.studioId } });
  if (!pack) return;

  await db.classPack.update({ where: { id }, data: { isActive: !pack.isActive } });

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: pack.isActive ? "pack.deactivate" : "pack.activate",
    entityType: "ClassPack",
    entityId: id,
  });

  revalidatePath("/[locale]/(app)/packs", "page");
}
