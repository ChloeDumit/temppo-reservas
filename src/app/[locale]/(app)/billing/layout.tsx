import type { ReactNode } from "react";
import { forbidAppointmentStudios } from "@/lib/appointments/guards";

/*
  Billing still sells the class plans; Temppo Beauty's plans are not billed
  through the app yet (see lib/brand/pricing). Until they are, an appointment
  business is sent home rather than offered the wrong product.
*/
export default async function BillingLayout({ children }: { children: ReactNode }) {
  await forbidAppointmentStudios();
  return children;
}
