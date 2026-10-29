import "server-only";
import { db } from "@/lib/db";
import type { NotificationPayload, NotificationTransport } from "./types";
import { renderEmail, type EmailBranding } from "./email-template";
import { brandByKey } from "@/lib/brand/registry";
import { appUrlFor } from "@/lib/brand/url";

const FALLBACK: EmailBranding = {
  studioName: "TEMPPO Reservas",
  accentColor: "#E07A5F",
  logoUrl: null,
  locale: "es",
  productName: "TEMPPO Reservas",
};

type Sender = EmailBranding & { from: string; appUrl: string };

/**
 * Looks up the studio so its own name, colour and logo carry into the email.
 *
 * Studio branding is promised on every plan, and a message landing in a
 * student's inbox is where it matters most — that inbox is the one place the
 * studio cannot dress up itself. A failed lookup falls back to TEMPPO's own
 * branding rather than blocking the send.
 */
async function brandingFor(studioId: string): Promise<Sender> {
  const fallback: Sender = {
    ...FALLBACK,
    from: brandByKey("temppo").emailFrom,
    appUrl: appUrlFor({ brand: "temppo" }),
  };
  try {
    const studio = await db.studio.findUnique({
      where: { id: studioId },
      select: { name: true, accentColor: true, logoUrl: true, locale: true, brand: true },
    });

    if (!studio) return fallback;
    // The sender and the footer follow the studio's brand, not whichever
    // host triggered the send — a cron job has no host at all.
    const brand = brandByKey(studio.brand);

    return {
      studioName: studio.name,
      accentColor: studio.accentColor || brand.accent,
      logoUrl: studio.logoUrl,
      locale: studio.locale,
      productName: brand.name,
      iconBase: brand.iconBase,
      from: brand.emailFrom,
      appUrl: appUrlFor(studio),
    };
  } catch {
    return fallback;
  }
}

/** Domains reserved for tests and examples (RFC 2606): nobody can receive mail there. */
const RESERVED_DOMAIN = /\.(test|example|invalid|localhost)$/i;

/** Whether this address would ever reach a real inbox. */
export function isDeliverableAddress(to: string | null | undefined) {
  const domain = to?.split("@")[1]?.trim();
  return domain ? !RESERVED_DOMAIN.test(domain) : false;
}

/**
 * Resend in production. Anywhere else the message is only printed: the
 * checks and the dev server create bookings by the dozen, and with a real key
 * in .env each one used to go out and spend Resend's daily quota. Set
 * EMAIL_SEND_IN_DEV=1 to send for real from a development machine.
 */
export const emailTransport: NotificationTransport = {
  channel: "EMAIL",
  async send(payload: NotificationPayload) {
    const apiKey = process.env.RESEND_API_KEY;
    const live = process.env.NODE_ENV === "production" || process.env.EMAIL_SEND_IN_DEV === "1";
    const deliverable = isDeliverableAddress(payload.to);

    if (!apiKey || !live || !deliverable) {
      const why = !apiKey ? "no key" : !live ? "dev" : "test address";
      console.info(
        `\n──── EMAIL (not sent: ${why}) ────\nTo: ${payload.to}\nSubject: ${payload.subject ?? ""}\n\n${payload.body}\n───────────────────────────────\n`,
      );
      return { ok: true };
    }

    const branding = await brandingFor(payload.studioId);
    const { from, appUrl } = branding;
    const subject = payload.subject ?? branding.productName ?? "TEMPPO Reservas";

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
