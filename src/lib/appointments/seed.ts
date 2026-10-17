import type { Prisma } from "@/generated/prisma/client";

/** Monday to Saturday, 9:00–19:00, in minutes since local midnight. */
export const DEFAULT_WEEK = [1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  startMin: 9 * 60,
  endMin: 19 * 60,
}));

/**
 * What a brand-new appointment business needs before its booking page can
 * show a single time: one category to file services under, and the owner's
 * hours. She is almost always the only professional at the start.
 */
export async function seedAppointmentStudio(
  tx: Prisma.TransactionClient,
  studioId: string,
  ownerId: string,
) {
  await tx.serviceCategory.create({ data: { studioId, name: "Servicios", position: 0 } });
  await tx.workingHours.createMany({
    data: DEFAULT_WEEK.map((h) => ({ studioId, staffId: ownerId, ...h })),
  });
}
