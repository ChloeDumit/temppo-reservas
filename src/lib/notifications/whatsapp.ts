import "server-only";
import type { NotificationPayload, NotificationTransport } from "./types";

/**
 * Meta Cloud API transport. Phase 2 wires reminders through this; until the
 * credentials exist it reports "not configured" so the caller falls back to email.
 */
export const whatsappTransport: NotificationTransport = {
  channel: "WHATSAPP",
  async send(payload: NotificationPayload) {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;

    if (!token || !phoneId) {
      return { ok: false, error: "WhatsApp not configured" };
    }

    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: payload.to,
          type: "text",
          text: { body: payload.body },
        }),
      });

      if (!res.ok) return { ok: false, error: `WhatsApp ${res.status}: ${await res.text()}` };
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  },
};
