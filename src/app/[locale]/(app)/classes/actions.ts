"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertStaff } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { ensureInstances } from "@/lib/classes";
import { normalizeHex } from "@/lib/color";

export type ActionState = { error?: string; ok?: boolean } | null;

const templateSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  colorHex: z.string().optional(),
  capacity: z.coerce.number().int().min(1).max(500),
  durationMins: z.coerce.number().int().min(5).max(600),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().optional(),
  instructorId: z.string().optional(),
  locationId: z.string().optional(),
});

export async function saveTemplateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertStaff();

  const parsed = templateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { error: field === "capacity" ? "capacityTooLow" : "generic" };
  }

  // Checkboxes arrive as repeated entries.
  const weekdays = formData
    .getAll("weekdays")
    .map((value) => Number(value))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);

  if (weekdays.length === 0) return { error: "selectWeekday" };

  const { id, name, description, colorHex, capacity, durationMins, startTime, startDate, endDate, instructorId, locationId } =
    parsed.data;

  const data = {
    name,
    description: description || null,
    colorHex: normalizeHex(colorHex ?? "#C0563C"),
    capacity,
    durationMins,
    weekdays,
    startTime,
    startDate: new Date(`${startDate}T00:00:00Z`),
    endDate: endDate ? new Date(`${endDate}T00:00:00Z`) : null,
    instructorId: instructorId || null,
    locationId: locationId || null,
  };

  let templateId: string;

  if (id) {
    const existing = await db.classTemplate.findFirst({
      where: { id, studioId: user.studioId },
    });
    if (!existing) return { error: "notFound" };

    await db.classTemplate.update({ where: { id }, data });
    templateId = id;

    // Future occurrences follow the new definition; past ones are history.
    await db.classInstance.deleteMany({
      where: {
        templateId: id,
        startsAt: { gt: new Date() },
        bookings: { none: {} }, // never drop a class someone booked
      },
    });
  } else {
    const created = await db.classTemplate.create({
      data: { ...data, studioId: user.studioId },
    });
    templateId = created.id;
  }

  await ensureInstances(user.studio);

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: id ? "class_template.update" : "class_template.create",
    entityType: "ClassTemplate",
    entityId: templateId,
    metadata: { name, weekdays, startTime },
  });

  revalidatePath("/[locale]/(app)/classes", "page");
  revalidatePath("/[locale]/(app)/schedule", "page");
  return { ok: true };
}

export async function toggleTemplateAction(formData: FormData) {
  const user = await assertStaff();
  const id = String(formData.get("id") ?? "");

  const template = await db.classTemplate.findFirst({
    where: { id, studioId: user.studioId },
  });
  if (!template) return;

  const isActive = !template.isActive;
  await db.classTemplate.update({ where: { id }, data: { isActive } });

  if (isActive) {
    await ensureInstances(user.studio);
  } else {
    // Pull unbooked future occurrences off the calendar.
    await db.classInstance.deleteMany({
      where: { templateId: id, startsAt: { gt: new Date() }, bookings: { none: {} } },
    });
  }

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: isActive ? "class_template.activate" : "class_template.deactivate",
    entityType: "ClassTemplate",
    entityId: id,
    metadata: { name: template.name },
  });

  revalidatePath("/[locale]/(app)/classes", "page");
  revalidatePath("/[locale]/(app)/schedule", "page");
}
