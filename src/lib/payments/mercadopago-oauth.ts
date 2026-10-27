import "server-only";
import { db } from "@/lib/db";
import { open, seal } from "@/lib/crypto/secret-box";

/*
  A studio connects its own Mercado Pago account so the deposits its clients
  pay online land with it directly, instead of in the platform's account
  waiting for a payout. Standard OAuth: the owner signs in at Mercado Pago,
  authorises our application, and we keep the token it hands back.

  Studios that have not connected keep working as before, on the platform's
  account (MERCADOPAGO_ACCESS_TOKEN).
*/

const API = "https://api.mercadopago.com";
/** Renew this long before expiry. Tokens last 180 days. */
const RENEW_BEFORE_MS = 30 * 86_400_000;

export function isMercadoPagoOAuthConfigured() {
  return Boolean(process.env.MERCADOPAGO_CLIENT_ID && process.env.MERCADOPAGO_CLIENT_SECRET);
}

/**
 * Must match, character for character, a redirect URL registered on the
 * Mercado Pago application. One for every brand: the callback carries the
 * studio in its signed state and sends her back to her own domain.
 */
export function oauthRedirectUri() {
  return (
    process.env.MERCADOPAGO_OAUTH_REDIRECT_URI ||
    `${process.env.APP_URL || "http://localhost:3000"}/api/mercadopago/callback`
  );
}

export function authorizationUrl(state: string) {
  const url = new URL("https://auth.mercadopago.com/authorization");
  url.searchParams.set("client_id", process.env.MERCADOPAGO_CLIENT_ID ?? "");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", oauthRedirectUri());
  return url.toString();
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: number | string;
  live_mode?: boolean;
};

async function requestToken(grant: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.MERCADOPAGO_CLIENT_ID,
      client_secret: process.env.MERCADOPAGO_CLIENT_SECRET,
      ...grant,
    }),
  });
  if (!res.ok) throw new Error(`Mercado Pago OAuth ${res.status}: ${await res.text()}`);
  return (await res.json()) as TokenResponse;
}

async function store(studioId: string, token: TokenResponse, now: Date, profile?: { nickname?: string; email?: string }) {
  const data = {
    mpUserId: String(token.user_id),
    accessTokenEnc: seal(token.access_token),
    refreshTokenEnc: seal(token.refresh_token),
    expiresAt: new Date(now.getTime() + token.expires_in * 1000),
    liveMode: token.live_mode ?? true,
    ...(profile ? { nickname: profile.nickname ?? null, email: profile.email ?? null } : {}),
  };
  await db.$transaction([
    db.mercadoPagoAccount.upsert({
      where: { studioId },
      create: { studioId, ...data, connectedAt: now },
      update: data,
    }),
    db.studio.update({ where: { id: studioId }, data: { mpConnectedAt: now } }),
  ]);
}

/** The callback's half: trade the code for tokens and keep them. */
export async function connectMercadoPago(studioId: string, code: string, now = new Date()) {
  const token = await requestToken({ grant_type: "authorization_code", code, redirect_uri: oauthRedirectUri() });
  const me = await fetch(`${API}/users/me`, { headers: { Authorization: `Bearer ${token.access_token}` } })
    .then((r) => (r.ok ? (r.json() as Promise<{ nickname?: string; email?: string }>) : {}))
    .catch(() => ({}));
  await store(studioId, token, now, me);
}

export async function disconnectMercadoPago(studioId: string) {
  await db.$transaction([
    db.mercadoPagoAccount.deleteMany({ where: { studioId } }),
    db.studio.update({ where: { id: studioId }, data: { mpConnectedAt: null } }),
  ]);
}

async function renew(account: { studioId: string; refreshTokenEnc: string }, now: Date) {
  const token = await requestToken({ grant_type: "refresh_token", refresh_token: open(account.refreshTokenEnc) });
  await store(account.studioId, token, now);
  return token.access_token;
}

/**
 * The token to charge this studio's deposits with, renewed first when it is
 * close to lapsing. Null when the studio has not connected — or when its
 * connection broke (she revoked it from Mercado Pago), in which case the
 * caller falls back to the platform's account rather than failing a client
 * mid-booking.
 */
export async function studioAccessToken(studioId: string, now = new Date()): Promise<string | null> {
  const account = await db.mercadoPagoAccount.findUnique({ where: { studioId } });
  if (!account) return null;
  try {
    if (account.expiresAt.getTime() - now.getTime() > RENEW_BEFORE_MS) return open(account.accessTokenEnc);
    return await renew(account, now);
  } catch (error) {
    console.error(`[mercadopago] token for studio ${studioId} unusable`, error);
    return account.expiresAt > now ? open(account.accessTokenEnc) : null;
  }
}

/**
 * Renews every token inside its last 30 days, from the 15-minute sweep, so a
 * studio that takes no online deposits for months does not quietly lose its
 * connection. Returns how many were renewed.
 */
export async function renewExpiringMercadoPagoTokens(now = new Date()) {
  if (!isMercadoPagoOAuthConfigured()) return 0;
  const due = await db.mercadoPagoAccount.findMany({
    where: { expiresAt: { lte: new Date(now.getTime() + RENEW_BEFORE_MS) } },
  });
  let renewed = 0;
  for (const account of due) {
    try {
      await renew(account, now);
      renewed++;
    } catch (error) {
      console.error(`[mercadopago] could not renew studio ${account.studioId}`, error);
    }
  }
  return renewed;
}
