import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { toWhatsAppNumber } from "@/lib/phone";
import { advanceDelivery, isDelivery, readWhatsAppPayload } from "@/lib/notifications/whatsapp-log";

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
    statuses?: {
      id: string;
      status: string;
      timestamp?: string;
      recipient_id?: string;
      errors?: { code?: number; title?: string; message?: string }[];
    }[];
    messages?: { from: string; type: string; text?: { body?: string }; button?: { text?: string } }[];
  };
};

const STOP = /^\s*(baja|stop|parar|no quiero)\s*[.!]?\s*$/i;
const START = /^\s*(alta|start)\s*[.!]?\s*$/i;

/**
 * Delivery receipts for what we sent, and the replies clients send back.
 * Each receipt moves its log row along — delivered, read or failed — so the
 * platform console shows how far a message got. BAJA stops every automatic
 * message to that number, ALTA turns them back on. Anything else is left.
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
        if (!isDelivery(status.status)) continue;
        const failed = status.status === "failed";
        const error = failed
          ? (status.errors?.map((e) => [e.code, e.message || e.title].filter(Boolean).join(" ")).join("; ") || "failed").slice(0, 500)
          : null;
        const row = await db.notificationLog.findUnique({
          where: { providerMessageId: status.id },
          select: { id: true, payload: true },
        });
        if (!row) {
          // Not one the app sent (a test from Meta's console, say). Logged so
          // a failure still leaves a reason in the function logs.
          if (failed) console.warn(`[whatsapp] ${status.id} to ${status.recipient_id ?? "?"} failed: ${error}`);
          continue;
        }
        const at = status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date();
        const current = readWhatsAppPayload(row.payload);
        await db.notificationLog.update({
          where: { id: row.id },
          data: {
            ...(current ? { payload: advanceDelivery(current, status.status, at) } : {}),
            ...(failed ? { status: "FAILED", error } : {}),
          },
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
