import { NextRequest, NextResponse } from "next/server";
import { sendDueReminders } from "@/lib/reminders";

// Long enough for a batch of studios; reminders are I/O bound.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Scheduled job. Vercel Cron sends an Authorization header built from
 * CRON_SECRET; keep the secret set in production or this refuses to run.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }

  try {
    const result = await sendDueReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/reminders]", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
