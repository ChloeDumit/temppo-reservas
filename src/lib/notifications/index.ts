import "server-only";
import { db } from "@/lib/db";
import { emailTransport } from "./email";
import { pushToUser, isPushConfigured } from "./push";
import type { NotificationPayload } from "./types";

export type { NotificationPayload } from "./types";

/**
 * Sends the message and records the attempt. Every send is logged whether it
 * succeeded or not, so studios can see what actually reached a student.
 */
export async function notify(payload: NotificationPayload): Promise<boolean> {
  const channel = "EMAIL" as const;

  // A student signed in by cédula may have no email at all. Nothing to send
  // and nothing to log against — but say so, or it vanishes with no trace.
  if (!payload.to) {
    console.warn(`[notify] no email address for template ${payload.template}`);
    return false;
  }

  const result = await emailTransport.send(payload);

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
 * then email as the guaranteed fallback.
 *
 * Push is additive rather than exclusive: it can be dismissed without being
 * read, so anything that matters still goes out over a durable channel.
 */
export async function notifyPreferred(
  payload: NotificationPayload & {
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

  return notify(payload);
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
      userId: owner.id,
    });
  }
}
