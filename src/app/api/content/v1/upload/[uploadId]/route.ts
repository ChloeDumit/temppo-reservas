import { NextRequest, NextResponse } from "next/server";
import { denyWithoutContentToken } from "@/lib/content/api-auth";
import { finishUpload, savePart } from "@/lib/content/upload";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The content API's uploads: same as the console's, with the API key instead of a session. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ uploadId: string }> }) {
  const denied = denyWithoutContentToken(request);
  if (denied) return denied;
  const { uploadId } = await params;
  const result = await savePart(uploadId, Number(request.nextUrl.searchParams.get("part")), new Uint8Array(await request.arrayBuffer()));
  return "error" in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ uploadId: string }> }) {
  const denied = denyWithoutContentToken(request);
  if (denied) return denied;
  const { uploadId } = await params;
  const body = (await request.json().catch(() => null)) ?? {};
  const result = await finishUpload({ uploadId, ...body });
  return "error" in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json({ ok: true, ...result });
}
