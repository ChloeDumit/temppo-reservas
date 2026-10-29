/*
  What a WhatsApp log row keeps in its `payload`, beyond the columns every
  channel shares: the text exactly as the client read it, and how far the
  message got. NotificationStatus only knows SENT and FAILED; delivered and
  read live here rather than in a migration, since only WhatsApp reports them.

  Pure, so the webhook, the console and the checks agree on one shape.
*/

export type WhatsAppDelivery = "sent" | "delivered" | "read" | "failed";

export type WhatsAppLogPayload = {
  /** The template's wording with its variables filled in. */
  text: string;
  /** The template's name in Meta. */
  metaName: string;
  language: string;
  params: string[];
  delivery: WhatsAppDelivery;
  deliveredAt?: string;
  readAt?: string;
  failedAt?: string;
};

const RANK: Record<WhatsAppDelivery, number> = { sent: 0, delivered: 1, read: 2, failed: 3 };

export function readWhatsAppPayload(payload: unknown): WhatsAppLogPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Partial<WhatsAppLogPayload>;
  return typeof p.text === "string" ? (p as WhatsAppLogPayload) : null;
}

/**
 * The payload after a delivery receipt. Meta's receipts can arrive out of
 * order, so a message never goes back from read to delivered; a failure
 * wins over anything, since it is the one that needs attention.
 */
export function advanceDelivery(
  payload: WhatsAppLogPayload,
  status: WhatsAppDelivery,
  at: Date,
): WhatsAppLogPayload {
  if (RANK[status] <= RANK[payload.delivery]) return payload;
  const stamp = at.toISOString();
  return {
    ...payload,
    delivery: status,
    ...(status === "delivered" ? { deliveredAt: stamp } : {}),
    ...(status === "read" ? { readAt: stamp, deliveredAt: payload.deliveredAt ?? stamp } : {}),
    ...(status === "failed" ? { failedAt: stamp } : {}),
  };
}

export function isDelivery(value: string): value is WhatsAppDelivery {
  return value in RANK;
}
