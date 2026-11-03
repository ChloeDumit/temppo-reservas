import { NextRequest, NextResponse } from "next/server";
import { assertPlatformAdmin } from "@/lib/auth/guards";
import { finishUpload, savePart } from "@/lib/content/upload";

export const dynamic = "force-dynamic";
// Stitching a large video's parts back together takes a moment.
export const maxDuration = 60;

/** The console's uploads, for a signed-in platform admin (see lib/content/upload). */
async function admin() {
  try {
    await assertPlatformAdmin();
    return null;
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ uploadId: string }> }) {
  const denied = await admin();
  if (denied) return denied;
  const { uploadId } = await params;
  const result = await savePart(uploadId, Number(request.nextUrl.searchParams.get("part")), new Uint8Array(await request.arrayBuffer()));
  return "error" in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ uploadId: string }> }) {
  const denied = await admin();
  if (denied) return denied;
  const { uploadId } = await params;
  const body = (await request.json().catch(() => null)) ?? {};
  const result = await finishUpload({ uploadId, ...body });
  return "error" in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json({ ok: true, ...result });
}
