import { createHash, randomBytes } from "node:crypto";

/** Opaque, URL-safe secret. Only ever stored hashed. */
export function generateToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
