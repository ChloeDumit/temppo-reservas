import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/*
  Secrets we hold on a studio's behalf — its Mercado Pago tokens — are
  encrypted before they reach the database, so a leaked backup or a stray
  query result is not a key to her account.

  AES-256-GCM, keyed from SECRETS_KEY, or AUTH_SECRET when that is not set.
  Changing the key makes stored secrets unreadable: studios would have to
  connect again, so set SECRETS_KEY once and leave it.
*/

function key(purpose: string) {
  const root = process.env.SECRETS_KEY || process.env.AUTH_SECRET;
  if (!root) throw new Error("SECRETS_KEY or AUTH_SECRET must be set");
  return createHash("sha256").update(`${purpose}:${root}`).digest();
}

/** iv.tag.ciphertext, each base64url. */
export function seal(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("secret-box"), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function open(sealed: string) {
  const [iv, tag, data] = sealed.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key("secret-box"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/**
 * A short-lived value only this server can have produced — the OAuth `state`
 * that carries which studio is connecting through Mercado Pago and back.
 */
export function signPayload(payload: Record<string, unknown>, ttlSeconds: number) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlSeconds * 1000 })).toString("base64url");
  const mac = createHmac("sha256", key("signed-payload")).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyPayload<T extends Record<string, unknown>>(token: string | null | undefined): T | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = Buffer.from(createHmac("sha256", key("signed-payload")).update(body).digest("base64url"));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp: number };
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}
