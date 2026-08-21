"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertUser } from "@/lib/auth/guards";
import { LOCATION_COOKIE, locationCookieOptions } from "@/lib/locations";

/**
 * Switches which sucursal the app is showing. An empty id means all of them.
 *
 * Validated against the caller's own studio before it is stored, so the cookie
 * can never be pointed at another studio's sucursal.
 */
export async function selectLocationAction(locationId: string) {
  const user = await assertUser();
  const store = await cookies();

  if (!locationId) {
    store.delete(LOCATION_COOKIE);
  } else {
    const owned = await db.location.findFirst({
      where: { id: locationId, studioId: user.studioId, isActive: true },
      select: { id: true },
    });
    if (!owned) return;
    store.set(LOCATION_COOKIE, owned.id, locationCookieOptions);
  }

  // Every screen reads this, so the whole tree is stale after a switch.
  revalidatePath("/", "layout");
}
