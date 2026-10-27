import "server-only";
import { notifyWhatsApp } from "@/lib/notifications/whatsapp";
import type { WhatsAppTemplateKey } from "@/lib/notifications/whatsapp-templates";

/**
 * The WhatsApp copy of a message a client also gets by email. Only for a
 * studio with automatic WhatsApp on; the quota, her number and BAJA are
 * checked by notifyWhatsApp. Sent whether or not she has an email: for the
 * many clients who only ever gave a phone, this is the only message they get.
 */
export async function whatsappToClient(params: {
  studio: { id: string; locale: string; waMode: string };
  phone: string | null | undefined;
  appointmentId: string;
  template: WhatsAppTemplateKey;
  params: string[];
  now?: Date;
}) {
  if (params.studio.waMode !== "CLOUD") return false;
  return notifyWhatsApp({
    studioId: params.studio.id,
    phone: params.phone,
    template: params.template,
    language: params.studio.locale,
    params: params.params,
    relatedType: "Appointment",
    relatedId: params.appointmentId,
    now: params.now,
  });
}
