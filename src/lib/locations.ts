import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";

/** Which sucursal the browser is currently looking at. */
export const LOCATION_COOKIE = "temppo_location";

/** A month: long enough that switching is rare, short enough to go stale. */
const LOCATION_COOKIE_MAX_AGE = 30 * 86_400;

export const locationCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: LOCATION_COOKIE_MAX_AGE,
} as const;

/** Every sucursal the studio still runs. Cached per request. */
export const listLocations = cache(async (studioId: string) =>
  db.location.findMany({
    where: { studioId, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  }),
);

/**
 * The sucursal in view, or null for "all of them".
 *
 * The cookie is never trusted on its own. An id belonging to another studio —
 * stale after switching accounts, or simply forged — resolves to null rather
 * than scoping a query to somebody else's data.
 */
export const currentLocationId = cache(async (studioId: string): Promise<string | null> => {
  const store = await cookies();
  const id = store.get(LOCATION_COOKIE)?.value;
  if (!id) return null;

  const found = await db.location.findFirst({
    where: { id, studioId, isActive: true },
    select: { id: true },
  });
  return found?.id ?? null;
});

/**
 * A `where` fragment for anything hanging off a location.
 *
 * Returns an empty object when no sucursal is chosen, so callers can spread it
 * unconditionally and get the whole studio back.
 */
export function locationScope(locationId: string | null) {
  return locationId ? { locationId } : {};
}

/**
 * The sucursales a given person may look at.
 *
 * Staff see every one the studio runs. A student sees the ones they belong to
 * — and if they belong to none yet, the studio's, so an unassigned student is
 * never shown an empty app.
 */
export const locationsFor = cache(
  async (studioId: string, studentProfileId?: string | null) => {
    if (!studentProfileId) return listLocations(studioId);

    const profile = await db.studentProfile.findUnique({
      where: { id: studentProfileId },
      select: {
        locations: {
          where: { isActive: true },
          select: { id: true, name: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    const mine = profile?.locations ?? [];
    return mine.length > 0 ? mine : listLocations(studioId);
  },
);
