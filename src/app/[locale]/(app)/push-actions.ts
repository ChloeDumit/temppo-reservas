"use server";

import { db } from "@/lib/db";
import { assertUser } from "@/lib/auth/guards";

/** Stores one device's push subscription against the signed-in user. */
export async function savePushSubscriptionAction(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}) {
  const user = await assertUser();
  if (!input.endpoint || !input.p256dh || !input.auth) return;

  // The same endpoint can move between accounts on a shared device.
  await db.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: {
      userId: user.id,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
    },
    update: { userId: user.id, p256dh: input.p256dh, auth: input.auth },
  });
}

export async function removePushSubscriptionAction(endpoint: string) {
  const user = await assertUser();
  await db.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
}
