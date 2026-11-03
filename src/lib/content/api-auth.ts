import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/*
  The content API's key: one long random secret in CONTENT_API_TOKEN, sent as
  "Authorization: Bearer <token>". It only reaches the platform's own content
  calendar — listing posts, attaching files, scheduling — and nothing that
  belongs to a studio. Remove the variable and the API refuses everything.
*/

const MIN_LENGTH = 32;

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Null when the request carries the key; otherwise the response to send back. */
export function denyWithoutContentToken(request: Request): NextResponse | null {
  const expected = process.env.CONTENT_API_TOKEN ?? "";
  if (expected.length < MIN_LENGTH) return NextResponse.json({ error: "content API not configured" }, { status: 503 });
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  // Compared as digests, so neither the length nor the content leaks through timing.
  if (!given || !timingSafeEqual(digest(given), digest(expected))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
