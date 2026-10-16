import "server-only";
import { redirect } from "next/navigation";
import { requireAdmin, requireStaff } from "@/lib/auth/guards";

/*
  Appointment screens make no sense for a class studio and vice versa; a
  stray link lands on the studio's own home instead of an empty page.
*/

export async function requireAppointmentStaff() {
  const user = await requireStaff();
  if (user.studio.vertical !== "APPOINTMENTS") redirect("/dashboard");
  return user;
}

export async function requireAppointmentAdmin() {
  const user = await requireAdmin();
  if (user.studio.vertical !== "APPOINTMENTS") redirect("/dashboard");
  return user;
}

/** Minutes as "1 h 30 min" for a service card. */
export function durationLabel(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
