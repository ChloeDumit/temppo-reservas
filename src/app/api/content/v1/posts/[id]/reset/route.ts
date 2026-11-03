import { NextRequest, NextResponse } from "next/server";
import { denyWithoutContentToken } from "@/lib/content/api-auth";
import { resetPost } from "@/lib/content/instagram";

export const dynamic = "force-dynamic";

/**
 * Frees a post stuck «publicando» or failed: marked published if it did reach
 * Instagram, back to «Lista» if not.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = denyWithoutContentToken(request);
  if (denied) return denied;
  const { id } = await params;
  const result = await resetPost(id);
  return "error" in result ? NextResponse.json({ error: result.error }, { status: result.httpStatus }) : NextResponse.json({ ok: true, ...result });
}
