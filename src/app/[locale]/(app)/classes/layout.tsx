import type { ReactNode } from "react";
import { forbidAppointmentStudios } from "@/lib/appointments/guards";

/** A class-studio screen: an appointment business is sent home instead. */
export default async function ClassesOnlyLayout({ children }: { children: ReactNode }) {
  await forbidAppointmentStudios();
  return children;
}
