import "server-only";
import { db } from "@/lib/db";
import { emailTransport } from "./email";
import { whatsappTransport } from "./whatsapp";
import { pushToUser, isPushConfigured } from "./push";
import type { NotificationPayload } from "./types";

export type { NotificationPayload } from "./types";

/**
 * Sends over one channel and records the attempt. Every send is logged whether
 * it succeeded or not, so studios can see what actually reached a student.
 */
export async function notify(
  channel: "EMAIL" | "WHATSAPP",
  payload: NotificationPayload,
): Promise<boolean> {
  // A student with no email (and no phone) simply has no address on this
  // channel. Nothing to send and nothing to log against — but say so, or the
  // message vanishes with no trace at all.
  if (!payload.to) {
    console.warn(`[notify] no ${channel} address for template ${payload.template}`);
    return false;
  }

  const transport = channel === "WHATSAPP" ? whatsappTransport : emailTransport;
  const result = await transport.send(payload);

  await db.notificationLog
    .create({
      data: {
        studioId: payload.studioId,
        channel,
        template: payload.template,
        recipient: payload.to,
        status: result.ok ? "SENT" : "FAILED",
        error: result.error ?? null,
        sentAt: result.ok ? new Date() : null,
        relatedType: payload.relatedType ?? null,
        relatedId: payload.relatedId ?? null,
      },
    })
    .catch((error) => console.error("[notify] log failed", error));

  return result.ok;
}

/**
 * Push first when the user has a device registered — it is instant and free —
 * then WhatsApp if we have a number, then email as the guaranteed fallback.
 *
 * Push is additive rather than exclusive: it can be dismissed without being
 * read, so anything that matters still goes out over a durable channel.
 */
export async function notifyPreferred(
  payload: NotificationPayload & {
    phone?: string | null;
    userId?: string | null;
    /** Where tapping the push notification should land. */
    url?: string;
  },
): Promise<boolean> {
  if (payload.userId && isPushConfigured()) {
    await pushToUser(payload.userId, {
      title: payload.subject ?? "TEMPPO Reservas",
      body: payload.body,
      url: payload.url,
      tag: payload.template,
    }).catch((error) => console.error("[notify] push failed", error));
  }

  if (payload.phone) {
    const sent = await notify("WHATSAPP", { ...payload, to: payload.phone });
    if (sent) return true;
  }
  return notify("EMAIL", payload);
}

/**
 * Fans a message out to everyone who runs the studio. Used for the things an
 * owner has to act on — a new lead, a waitlist queue forming, a transfer
 * waiting to be approved — none of which the student can chase on their behalf.
 */
export async function notifyOwners(
  studioId: string,
  payload: Omit<NotificationPayload, "studioId" | "to"> & { url?: string },
): Promise<void> {
  const owners = await db.user.findMany({
    where: { studioId, role: { in: ["OWNER", "ADMIN"] }, isActive: true },
  });

  for (const owner of owners) {
    await notifyPreferred({
      ...payload,
      studioId,
      to: owner.email,
      phone: owner.phone,
      userId: owner.id,
    });
  }
}
