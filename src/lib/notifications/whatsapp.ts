import "server-only";
import { db } from "@/lib/db";
import { addMonths } from "@/lib/dates";
import { toWhatsAppNumber } from "@/lib/phone";

/*
  Automatic WhatsApp through Meta's Cloud API — the paid add-on for appointment
  studios. Every studio sends from the platform's one number, and every
  message is a template approved in Meta's console: a business may only open
  a conversation with one, never with free text.

  Each message costs us (about US$0.011 to Uruguay), so it is counted against
  the studio's monthly quota before it goes out, and given back if it fails.
*/

const API_VERSION = process.env.WHATSAPP_API_VERSION || "v23.0";

export function isWhatsAppConfigured() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

type SendResult = { ok: true; id: string | null } | { ok: false; error: string };

/**
 * One template message. In development without a token it is printed instead,
 * like email, so the flow can be followed without a Meta account.
 */
async function sendTemplate(to: string, template: string, language: string, params: string[]): Promise<SendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.info(`\n──── WHATSAPP (dev, not sent) ────\nTo: +${to}\nTemplate: ${template} [${language}]\n${params.map((p, i) => `{{${i + 1}}} ${p}`).join("\n")}\n───────────────────────────────\n`);
    return { ok: true, id: null };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: template,
          language: { code: language },
          components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
        },
      }),
    });
    const body = (await res.json().catch(() => null)) as { messages?: { id: string }[]; error?: { message?: string } } | null;
    if (!res.ok) return { ok: false, error: `WhatsApp ${res.status}: ${body?.error?.message ?? "unknown error"}` };
    return { ok: true, id: body?.messages?.[0]?.id ?? null };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * Takes one message from the studio's quota, starting a new month first when
 * the last one is over. Atomic, so two sweeps running at once cannot both
 * spend the last message.
 */
export async function claimWhatsAppMessage(studioId: string, now: Date): Promise<boolean> {
  await db.studio.updateMany({
    where: { id: studioId, OR: [{ waPeriodStart: null }, { waPeriodStart: { lte: addMonths(now, -1) } }] },
    data: { waPeriodStart: now, waSentThisPeriod: 0 },
  });
  const claimed = await db.studio.updateMany({
    where: { id: studioId, waMode: "CLOUD", waSentThisPeriod: { lt: db.studio.fields.waMonthlyQuota } },
    data: { waSentThisPeriod: { increment: 1 } },
  });
  return claimed.count === 1;
}

async function releaseWhatsAppMessage(studioId: string) {
  await db.studio.updateMany({
    where: { id: studioId, waSentThisPeriod: { gt: 0 } },
    data: { waSentThisPeriod: { decrement: 1 } },
  });
}

export type WhatsAppPayload = {
  studioId: string;
  phone: string | null | undefined;
  /** The template's name exactly as approved in Meta's console. */
  template: string;
  /** "es" or "en"; the template must be approved in that language. */
  language: string;
  /** Fills {{1}}, {{2}}… in order. */
  params: string[];
  relatedType?: string;
  relatedId?: string;
  now?: Date;
};

/**
 * Sends a template to a client when the studio has automatic WhatsApp, quota
 * left, and she has a usable number she has not asked us to stop. Returns
 * whether it went out; when it did not, the other channels still did.
 */
export async function notifyWhatsApp(payload: WhatsAppPayload): Promise<boolean> {
  // Production without credentials sends nothing, rather than spending quota
  // on the development echo and logging it as delivered.
  if (!isWhatsAppConfigured() && process.env.NODE_ENV === "production") return false;
  const to = toWhatsAppNumber(payload.phone);
  if (!to) return false;
  if (await db.whatsAppOptOut.findUnique({ where: { phone: to } })) return false;
  if (!(await claimWhatsAppMessage(payload.studioId, payload.now ?? new Date()))) return false;

  const result = await sendTemplate(to, payload.template, payload.language, payload.params);
  if (!result.ok) await releaseWhatsAppMessage(payload.studioId);

  await db.notificationLog
    .create({
      data: {
        studioId: payload.studioId,
        channel: "WHATSAPP",
        template: payload.template,
        recipient: to,
        status: result.ok ? "SENT" : "FAILED",
        error: result.ok ? null : result.error,
        providerMessageId: result.ok ? result.id : null,
        sentAt: result.ok ? new Date() : null,
        relatedType: payload.relatedType ?? null,
        relatedId: payload.relatedId ?? null,
      },
    })
    .catch((error) => console.error("[whatsapp] log failed", error));

  return result.ok;
}
