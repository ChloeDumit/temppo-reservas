import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { toWhatsAppNumber } from "@/lib/phone";

export const dynamic = "force-dynamic";

/**
 * Meta checks the callback URL once, when it is saved in the app's WhatsApp
 * settings, by asking it to echo a challenge back with our verify token.
 */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (expected && params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === expected) {
    return new NextResponse(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

/** Meta signs the raw body with the app secret. */
function signatureValid(raw: string, header: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
  const given = Buffer.from(header.slice(7));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

type Change = {
  value?: {
    statuses?: { id: string; status: string; errors?: { title?: string; message?: string }[] }[];
    messages?: { from: string; type: string; text?: { body?: string }; button?: { text?: string } }[];
  };
};

const STOP = /^\s*(baja|stop|parar|no quiero)\s*[.!]?\s*$/i;
const START = /^\s*(alta|start)\s*[.!]?\s*$/i;

/**
 * Delivery receipts for what we sent, and the replies clients send back. A
 * failed delivery marks its log row; BAJA stops every automatic message to
 * that number, ALTA turns them back on. Anything else is left for now.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!signatureValid(raw, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let payload: { entry?: { changes?: Change[] }[] };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        if (status.status !== "failed") continue;
        const error = status.errors?.map((e) => e.message || e.title).join("; ") || "failed";
        await db.notificationLog.updateMany({
          where: { providerMessageId: status.id },
          data: { status: "FAILED", error: error.slice(0, 500) },
        });
      }

      for (const message of change.value?.messages ?? []) {
        const phone = toWhatsAppNumber(message.from);
        const text = message.text?.body ?? message.button?.text ?? "";
        if (!phone) continue;
        if (STOP.test(text)) {
          await db.whatsAppOptOut.upsert({ where: { phone }, create: { phone }, update: {} });
        } else if (START.test(text)) {
          await db.whatsAppOptOut.deleteMany({ where: { phone } });
        }
      }
    }
  }

  // Always 200 once it is ours: Meta retries anything else for days.
  return NextResponse.json({ ok: true });
}
