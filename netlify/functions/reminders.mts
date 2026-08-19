import type { Config } from "@netlify/functions";

/**
 * Scheduled job that drives class reminders and waitlist-offer expiry.
 *
 * Netlify schedules functions rather than routes, so this thin wrapper calls
 * the app's own cron endpoint. Keeping the logic in the Next route means the
 * same code path runs on any host.
 */
export default async () => {
  const base = process.env.APP_URL;
  const secret = process.env.CRON_SECRET;

  if (!base || !secret) {
    console.error("[reminders] APP_URL and CRON_SECRET must both be set");
    return new Response("not configured", { status: 500 });
  }

  const path = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const url = `${base}${path}/api/cron/reminders`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = await res.text();

    if (!res.ok) {
      console.error(`[reminders] ${res.status}: ${body}`);
      return new Response(body, { status: res.status });
    }

    console.log(`[reminders] ${body}`);
    return new Response(body, { status: 200 });
  } catch (error) {
    console.error("[reminders] failed", error);
    return new Response(String(error), { status: 500 });
  }
};

// Every 15 minutes, matching the reminder sweep window.
export const config: Config = {
  schedule: "*/15 * * * *",
};
