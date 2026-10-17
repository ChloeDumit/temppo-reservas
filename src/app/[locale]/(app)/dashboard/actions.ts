"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { assertStaff } from "@/lib/auth/guards";

const layoutSchema = z.object({
  order: z.array(z.string().max(40)).max(30),
  hidden: z.array(z.string().max(40)).max(30),
});

/** Saves how this person arranged her home panel. Null resets to the default. */
export async function saveHomeLayoutAction(layout: z.input<typeof layoutSchema> | null) {
  const user = await assertStaff();
  if (layout === null) {
    await db.user.update({ where: { id: user.id }, data: { homeLayout: Prisma.DbNull } });
  } else {
    const parsed = layoutSchema.safeParse(layout);
    if (!parsed.success) return { ok: false };
    await db.user.update({ where: { id: user.id }, data: { homeLayout: parsed.data } });
  }
  revalidatePath("/[locale]/(app)/dashboard", "page");
  return { ok: true };
}
