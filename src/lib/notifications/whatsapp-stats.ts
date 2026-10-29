import "server-only";

const API_VERSION = process.env.WHATSAPP_API_VERSION || "v23.0";

export type WhatsAppSpend = {
  messages: number;
  costUsd: number;
  byCategory: { category: string; messages: number; costUsd: number }[];
};

/**
 * What Meta has billed for messages since `from`, from its pricing analytics.
 * The authoritative number: it counts every message on the account, including
 * any sent from Meta's own tools, at the rate actually charged. Null when the
 * account is not configured or Meta does not answer; the console then falls
 * back to counting our own log.
 */
export async function whatsAppSpendSince(from: Date): Promise<WhatsAppSpend | null> {
  const token = process.env.WHATSAPP_TOKEN;
  const waba = process.env.WHATSAPP_WABA_ID;
  if (!token || !waba) return null;

  const start = Math.floor(from.getTime() / 1000);
  const end = Math.floor(Date.now() / 1000);
  const field = `pricing_analytics.start(${start}).end(${end}).granularity(DAILY).dimensions(PRICING_CATEGORY,PRICING_TYPE)`;
  try {
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${waba}?fields=${encodeURIComponent(field)}`, {
      headers: { Authorization: `Bearer ${token}` },
      // Meta updates these figures a few times an hour; no need to ask more often.
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      pricing_analytics?: {
        data?: { data_points?: { pricing_category?: string; volume?: number; cost?: number }[] }[];
      };
    };
    const points = (body.pricing_analytics?.data ?? []).flatMap((d) => d.data_points ?? []);
    const byCategory = new Map<string, { messages: number; costUsd: number }>();
    for (const p of points) {
      const key = p.pricing_category ?? "OTHER";
      const entry = byCategory.get(key) ?? { messages: 0, costUsd: 0 };
      entry.messages += p.volume ?? 0;
      entry.costUsd += p.cost ?? 0;
      byCategory.set(key, entry);
    }
    const list = [...byCategory.entries()].map(([category, v]) => ({ category, ...v }));
    return {
      messages: list.reduce((sum, c) => sum + c.messages, 0),
      costUsd: list.reduce((sum, c) => sum + c.costUsd, 0),
      byCategory: list,
    };
  } catch {
    return null;
  }
}
