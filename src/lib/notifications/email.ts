import "server-only";
import type { NotificationPayload, NotificationTransport } from "./types";

/**
 * Resend in production; in development the message is printed so magic links
 * are usable without any API key configured.
 */
export const emailTransport: NotificationTransport = {
  channel: "EMAIL",
  async send(payload: NotificationPayload) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM || "TEMPPO Reservas <noreply@temppo.app>";

    // In development always echo the message to the console, even when a real
    // key is configured: Resend's shared sender only delivers to the address
    // that owns the account, so magic links to demo students would otherwise
    // vanish silently.
    if (!apiKey || process.env.NODE_ENV !== "production") {
      console.info(
        `\n──── EMAIL${apiKey ? "" : " (dev, not sent)"} ────\nTo: ${payload.to}\nSubject: ${payload.subject ?? ""}\n\n${payload.body}\n───────────────────────────────\n`,
      );
      if (!apiKey) return { ok: true };
    }

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [payload.to],
          subject: payload.subject ?? "TEMPPO Reservas",
          text: payload.body,
        }),
      });

      if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${await res.text()}` };
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  },
};
