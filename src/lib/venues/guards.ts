import "server-only";
import { redirect } from "next/navigation";
import { requireAdmin, requireStaff } from "@/lib/auth/guards";

/*
  Court screens make no sense for a class studio or a salon, and vice versa; a
  stray link lands on the business's own home instead of an empty page.
*/

export async function requireVenueStaff() {
  const user = await requireStaff();
  if (user.studio.vertical !== "VENUES") redirect("/dashboard");
  return user;
}

export async function requireVenueAdmin() {
  const user = await requireAdmin();
  if (user.studio.vertical !== "VENUES") redirect("/dashboard");
  return user;
}

/** "1 h 30 min" for a court card. */
export function lengthLabel(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "08:00" from minutes since local midnight. */
export function hhmm(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** The reverse, for a time input. Returns null on anything unparseable. */
export function minutesFromHhmm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const mins = Number(m[2]);
  if (hours > 24 || mins > 59) return null;
  return hours * 60 + mins;
}
