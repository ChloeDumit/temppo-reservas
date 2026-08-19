import "server-only";
import webpush from "web-push";
import { db } from "@/lib/db";

let configured = false;

/** Lazily configure so a missing key disables push instead of crashing boot. */
function configure() {
  if (configured) return true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:hola@temppo.uy",
    publicKey,
    privateKey,
  );
  configured = true;
  return true;
}

export function isPushConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export type PushMessage = {
  title: string;
  body: string;
  /** Where tapping the notification lands. */
  url?: string;
  /** Same tag replaces an earlier notification instead of stacking. */
  tag?: string;
};

/**
 * Pushes to every device a user has registered.
 *
 * Subscriptions die when a browser is reinstalled or permission is revoked;
 * the push service reports that as 404/410 and we drop the row so the table
 * doesn't fill with dead endpoints.
 */
export async function pushToUser(userId: string, message: PushMessage) {
  if (!configure()) return { sent: 0, failed: 0 };

  const subscriptions = await db.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return { sent: 0, failed: 0 };

  const payload = JSON.stringify(message);
  const stale: string[] = [];
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        );
        sent++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) stale.push(sub.id);
        else console.error("[push] send failed", status, error);
        failed++;
      }
    }),
  );

  if (stale.length > 0) {
    await db.pushSubscription.deleteMany({ where: { id: { in: stale } } });
  }

  if (sent > 0) {
    await db.pushSubscription
      .updateMany({
        where: { userId, id: { notIn: stale } },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {});
  }

  return { sent, failed };
}
