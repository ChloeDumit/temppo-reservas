"use server";

import { db } from "@/lib/db";
import { assertUser, ADMIN_ROLES } from "@/lib/auth/guards";

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

/**
 * How far the studio has actually got with its setup.
 *
 * Fetched when the tour opens rather than passed down from the layout: this is
 * six counts, and a walkthrough that runs once must not put them on the path of
 * every page view. Re-read each time the tour resumes, so a step the owner has
 * just completed is ticked off by the time they come back to it.
 */
export async function tourProgressAction() {
  const user = await assertUser();

  // Only the roles that can run setup see the counts behind it.
  const empty = { locations: 0, teachers: 0, packs: 0, classes: 0, students: 0, spots: 0 };
  if (!ADMIN_ROLES.includes(user.role)) return empty;

  const studioId = user.studioId;
  const [locations, teachers, packs, classes, students, spots] = await Promise.all([
    db.location.count({ where: { studioId, isActive: true } }),
    db.instructorProfile.count({ where: { user: { studioId, isActive: true } } }),
    db.classPack.count({ where: { studioId } }),
    db.classTemplate.count({ where: { studioId } }),
    db.user.count({ where: { studioId, role: "STUDENT", isActive: true } }),
    db.recurringBooking.count({ where: { studioId, status: "ACTIVE" } }),
  ]);

  return { locations, teachers, packs, classes, students, spots };
}
