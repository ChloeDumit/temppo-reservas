/**
 * A studio's own Mercado Pago: connecting, charging deposits into it, and
 * keeping those out of what the platform owes.
 * Run with: npx tsx scripts/verify-studio-mercadopago.ts
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never;

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
  ok ? passed++ : failed++;
}

async function main() {
  process.env.AUTH_SECRET ||= "verify-secret";
  process.env.MERCADOPAGO_CLIENT_ID = "app-123";
  process.env.MERCADOPAGO_CLIENT_SECRET = "app-secret";
  delete process.env.MERCADOPAGO_ACCESS_TOKEN;
  delete process.env.MERCADOPAGO_MARKETPLACE_FEE_PERCENT;

  const { seal, open, signPayload, verifyPayload } = await import("../src/lib/crypto/secret-box");
  const { connectMercadoPago, studioAccessToken, renewExpiringMercadoPagoTokens, disconnectMercadoPago, authorizationUrl } =
    await import("../src/lib/payments/mercadopago-oauth");
  const { startDepositCheckout, owedToStudio } = await import("../src/lib/appointments/payments");
  const { depositMethods } = await import("../src/lib/appointments/methods");
  const { bookAppointment } = await import("../src/lib/appointments/book");
  const { wallTimeToUtc } = await import("../src/lib/dates");

  console.log("\nSecrets");
  const sealed = seal("APP_USR-token");
  check("a sealed token reads back", open(sealed), "APP_USR-token");
  check("and is not stored in the clear", sealed.includes("APP_USR"), false);
  const state = signPayload({ sid: "s1", uid: "u1" }, 60);
  check("a signed state verifies", verifyPayload<{ sid: string }>(state)?.sid, "s1");
  check("a tampered one does not", verifyPayload(state.replace(/.$/, (c) => (c === "A" ? "B" : "A"))), null);
  check("an expired one does not", verifyPayload(signPayload({ sid: "s1" }, -1)), null);
  check("the authorisation link carries our app and state", new URL(authorizationUrl(state)).searchParams.get("client_id"), "app-123");

  // Mercado Pago, stood in for.
  const realFetch = globalThis.fetch;
  const calls: { url: string; auth: string | null; body: Record<string, unknown> | null }[] = [];
  let issued = 0;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (!u.includes("mercadopago.com")) return realFetch(url, init);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url: u, auth: new Headers(init?.headers).get("authorization"), body });
    if (u.endsWith("/oauth/token")) {
      issued++;
      return Response.json({ access_token: `APP_USR-studio-${issued}`, refresh_token: `TG-${issued}`, expires_in: 15552000, user_id: 777, live_mode: true });
    }
    if (u.endsWith("/users/me")) return Response.json({ nickname: "STUDIOLU", email: "lu@mp.test" });
    if (u.endsWith("/checkout/preferences")) return Response.json({ id: "pref-1", init_point: "https://mp.test/pay" });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;

  const TZ = "America/Montevideo";
  await db.studio.deleteMany({ where: { slug: "verify-studio-mp" } });
  const studio = await db.studio.create({
    data: { name: "Studio Lu", slug: "verify-studio-mp", vertical: "APPOINTMENTS", brand: "beauty", minNoticeMinutes: 0 },
  });
  const pro = await db.user.create({ data: { studioId: studio.id, email: "lu@v.test", name: "Lu", role: "OWNER" } });
  await db.workingHours.create({ data: { studioId: studio.id, staffId: pro.id, weekday: 1, startMin: 540, endMin: 1080 } });
  const service = await db.service.create({
    data: { studioId: studio.id, name: "Uñas", durationMin: 60, priceCents: 100000, depositType: "FIXED", depositValue: 30000 },
  });
  const client = await db.user.create({
    data: { studioId: studio.id, name: "Ana", role: "STUDENT", studentProfile: { create: {} } },
    include: { studentProfile: true },
  });
  const now = wallTimeToUtc("2026-10-16", "12:00", TZ);
  const book = async (time: string) => {
    const s = await db.studio.findUniqueOrThrow({ where: { id: studio.id } });
    return bookAppointment({
      studio: s,
      clientId: client.studentProfile!.id,
      serviceId: service.id,
      staffId: pro.id,
      startsAt: wallTimeToUtc("2026-10-19", time, TZ),
      source: "CLIENT_PUBLIC",
      collectDeposit: true,
      now,
    });
  };
  const urls = {
    payerEmail: "ana@c.test",
    successUrl: "https://beauty.test/ok",
    failureUrl: "https://beauty.test/ko",
    notificationUrl: "https://beauty.test/api/payments/webhook",
  };

  console.log("\nBefore connecting");
  check("no Mercado Pago anywhere: not offered", depositMethods(studio).mp, false);
  const first = await book("10:00");
  if (!first.ok) throw new Error("booking failed");
  check("and no checkout opens", await startDepositCheckout({ appointmentId: first.appointmentId, ...urls }), null);

  console.log("\nConnecting");
  await connectMercadoPago(studio.id, "code-1", now);
  const account = await db.mercadoPagoAccount.findUniqueOrThrow({ where: { studioId: studio.id } });
  check("the account is kept with its name", [account.mpUserId, account.nickname], ["777", "STUDIOLU"]);
  check("the token is encrypted at rest", account.accessTokenEnc.includes("APP_USR"), false);
  const connected = await db.studio.findUniqueOrThrow({ where: { id: studio.id } });
  check("the studio is marked connected", Boolean(connected.mpConnectedAt), true);
  check("so Mercado Pago is offered, with no platform account at all", depositMethods(connected).mp, true);

  console.log("\nCharging into her account");
  const redirect = await startDepositCheckout({ appointmentId: first.appointmentId, ...urls });
  check("a checkout opens", redirect, "https://mp.test/pay");
  const pref = calls.find((c) => c.url.endsWith("/checkout/preferences"))!;
  check("charged with her token", pref.auth, "Bearer APP_USR-studio-1");
  check("the notification says whose account it is", new URL(String(pref.body?.notification_url)).searchParams.get("studio"), studio.id);
  check("no platform fee unless one is set", pref.body?.marketplace_fee, undefined);
  const payment = await db.payment.findFirstOrThrow({ where: { appointmentId: first.appointmentId } });
  check("the payment is marked as hers", payment.collectedByStudio, true);

  await db.payment.update({ where: { id: payment.id }, data: { status: "APPROVED", approvedAt: now } });
  check("once approved, the platform owes her nothing for it", (await owedToStudio(studio.id)).amountCents, 0);

  console.log("\nPlatform fee");
  process.env.MERCADOPAGO_MARKETPLACE_FEE_PERCENT = "5";
  const second = await book("12:00");
  if (!second.ok) throw new Error("booking failed");
  await startDepositCheckout({ appointmentId: second.appointmentId, ...urls });
  check("5% of a $300 deposit is $15", calls.filter((c) => c.url.endsWith("/checkout/preferences")).at(-1)?.body?.marketplace_fee, 15);
  delete process.env.MERCADOPAGO_MARKETPLACE_FEE_PERCENT;

  console.log("\nRenewal");
  const lateNow = new Date(account.expiresAt.getTime() - 10 * 86_400_000);
  check("nothing to renew while the token is young", await renewExpiringMercadoPagoTokens(now), 0);
  check("renewed in its last month by the sweep", await renewExpiringMercadoPagoTokens(lateNow), 1);
  const renewCall = calls.filter((c) => c.url.endsWith("/oauth/token")).at(-1)!;
  check("with the refresh token", [renewCall.body?.grant_type, renewCall.body?.refresh_token], ["refresh_token", "TG-1"]);
  check("and the new token is the one used", await studioAccessToken(studio.id, now), "APP_USR-studio-2");

  console.log("\nDisconnecting");
  await disconnectMercadoPago(studio.id);
  const after = await db.studio.findUniqueOrThrow({ where: { id: studio.id } });
  check("the tokens are gone", await db.mercadoPagoAccount.count({ where: { studioId: studio.id } }), 0);
  check("and Mercado Pago is no longer offered", depositMethods(after).mp, false);

  globalThis.fetch = realFetch;
  await db.studio.delete({ where: { id: studio.id } });
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
