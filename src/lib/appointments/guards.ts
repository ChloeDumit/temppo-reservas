import "server-only";
import { redirect } from "next/navigation";
import { requireAdmin, requireStaff } from "@/lib/auth/guards";
import { getCurrentUser } from "@/lib/auth/session";

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

/**
 * The other way round: a class screen reached by an appointment business —
 * a typed URL, an old bookmark — sends it home. Clients go to their
 * appointments, staff to their dashboard. Used by the class routes' layouts.
 */
export async function forbidAppointmentStudios() {
  const user = await getCurrentUser();
  if (user?.studio.vertical === "APPOINTMENTS") redirect(user.role === "STUDENT" ? "/appointments" : "/dashboard");
}

/** Minutes as "1 h 30 min" for a service card. */
export function durationLabel(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
