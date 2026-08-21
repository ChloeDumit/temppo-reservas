import "server-only";
import { db } from "@/lib/db";
import type { NotificationPayload, NotificationTransport } from "./types";
import { renderEmail, type EmailBranding } from "./email-template";

const FALLBACK: EmailBranding = {
  studioName: "TEMPPO Reservas",
  accentColor: "#E07A5F",
  logoUrl: null,
  locale: "es",
};

/**
 * Looks up the studio so its own name, colour and logo carry into the email.
 *
 * Studio branding is promised on every plan, and a message landing in a
 * student's inbox is where it matters most — that inbox is the one place the
 * studio cannot dress up itself. A failed lookup falls back to TEMPPO's own
 * branding rather than blocking the send.
 */
async function brandingFor(studioId: string): Promise<EmailBranding> {
  try {
    const studio = await db.studio.findUnique({
      where: { id: studioId },
      select: { name: true, accentColor: true, logoUrl: true, locale: true },
    });

    if (!studio) return FALLBACK;

    return {
      studioName: studio.name,
      accentColor: studio.accentColor || FALLBACK.accentColor,
      logoUrl: studio.logoUrl,
      locale: studio.locale,
    };
  } catch {
    return FALLBACK;
  }
}

/**
 * Resend in production; in development the message is printed so magic links
 * are usable without any API key configured.
 */
export const emailTransport: NotificationTransport = {
  channel: "EMAIL",
  async send(payload: NotificationPayload) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM || "TEMPPO Reservas <no-reply@reservas.temppo.uy>";
    const appUrl = process.env.APP_URL || "http://localhost:3000";

    // In development always echo the message to the console, even when a real
    // key is configured: a magic link is far easier to follow from the terminal
    // than from an inbox, and demo addresses never receive anything anyway.
    if (!apiKey || process.env.NODE_ENV !== "production") {
      console.info(
        `\n──── EMAIL${apiKey ? "" : " (dev, not sent)"} ────\nTo: ${payload.to}\nSubject: ${payload.subject ?? ""}\n\n${payload.body}\n───────────────────────────────\n`,
      );
      if (!apiKey) return { ok: true };
    }

    const subject = payload.subject ?? "TEMPPO Reservas";
    const branding = await brandingFor(payload.studioId);

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
          subject,
          // Both parts, always. The plain-text alternative is what keeps this
          // out of spam filters and readable in clients that refuse HTML.
          text: payload.body,
          html: renderEmail({
            body: payload.body,
            subject,
            template: payload.template,
            branding,
            appUrl,
          }),
        }),
      });

      if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${await res.text()}` };
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  },
};
