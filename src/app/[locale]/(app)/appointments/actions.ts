"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertUser } from "@/lib/auth/guards";
import { cancelAppointment } from "@/lib/appointments/book";
import { notifyClientCancelled } from "@/lib/appointments/notify";

/** A signed-in client cancelling her own appointment, under the same rules as the link. */
export async function cancelMyAppointmentAction(formData: FormData) {
  const user = await assertUser();
  if (!user.studentProfile) return;
  const appt = await db.appointment.findFirst({
    where: { id: String(formData.get("id") ?? ""), clientId: user.studentProfile.id },
  });
  if (!appt) return;
  const result = await cancelAppointment({ studio: user.studio, appointmentId: appt.id, by: "client" });
  if (result.ok) await notifyClientCancelled(appt.id, result.depositStatus);
  revalidatePath("/[locale]/(app)/appointments", "page");
}
