"use server";

import { db } from "@/lib/db";
import { assertUser } from "@/lib/auth/guards";

/**
 * Marks the guided tour as seen for this account.
 *
 * Called the moment the tour opens rather than when it finishes: a walkthrough
 * that reappears because someone closed the app halfway through is the exact
 * thing this is meant to prevent. Replaying it stays available on demand.
 */
export async function markTourSeenAction() {
  const user = await assertUser();
  if (user.tourSeenAt) return;

  await db.user.update({
    where: { id: user.id },
    data: { tourSeenAt: new Date() },
  });
}
