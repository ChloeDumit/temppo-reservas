import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { assertPlatformAdmin } from "@/lib/auth/guards";
import { deletePrefix, getMedia, putMedia } from "@/lib/content/storage";
import { PART_BYTES, processUpload } from "@/lib/content/media";

export const dynamic = "force-dynamic";
// Stitching a large video's parts back together takes a moment.
export const maxDuration = 60;

/*
  Uploads in parts: a function only takes a few MB per request, and a reel can
  be much more. The browser sends each part with PUT, then POST stitches them
  together, converts images to JPEG and attaches the file to the post.
*/

const UPLOAD_ID = /^[0-9a-f-]{36}$/;

async function guard(uploadId: string) {
  try {
    await assertPlatformAdmin();
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!UPLOAD_ID.test(uploadId)) return NextResponse.json({ error: "bad upload id" }, { status: 400 });
  return null;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ uploadId: string }> }) {
  const { uploadId } = await params;
  const denied = await guard(uploadId);
  if (denied) return denied;
  const part = Number(request.nextUrl.searchParams.get("part"));
  if (!Number.isInteger(part) || part < 0 || part > 200) return NextResponse.json({ error: "bad part" }, { status: 400 });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > PART_BYTES + 1024) return NextResponse.json({ error: "bad part size" }, { status: 400 });
  await putMedia(`uploads/${uploadId}/${String(part).padStart(4, "0")}`, bytes, "application/octet-stream");
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ uploadId: string }> }) {
  const { uploadId } = await params;
  const denied = await guard(uploadId);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { postId?: string; filename?: string; mimeType?: string; parts?: number } | null;
  if (!body?.postId || !body.mimeType || !body.parts) return NextResponse.json({ error: "missing fields" }, { status: 400 });

  const post = await db.contentPost.findUnique({ where: { id: body.postId }, select: { id: true, status: true, _count: { select: { media: true } } } });
  if (!post) return NextResponse.json({ error: "post not found" }, { status: 404 });
  if (post.status === "PUBLISHED" || post.status === "PUBLISHING") {
    return NextResponse.json({ error: "Ya se está publicando: no se le pueden cambiar los archivos" }, { status: 409 });
  }

  const chunks: Uint8Array[] = [];
  for (let i = 0; i < body.parts; i++) {
    const part = await getMedia(`uploads/${uploadId}/${String(i).padStart(4, "0")}`);
    if (!part) return NextResponse.json({ error: `missing part ${i}` }, { status: 400 });
    chunks.push(part.bytes);
  }
  const whole = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let offset = 0;
  for (const c of chunks) {
    whole.set(c, offset);
    offset += c.byteLength;
  }
  await deletePrefix(`uploads/${uploadId}`);

  const processed = await processUpload(whole, body.mimeType);
  if ("error" in processed) return NextResponse.json({ error: processed.error }, { status: 400 });

  const key = `media/${post.id}/${randomUUID()}.${processed.ext}`;
  await putMedia(key, processed.bytes, processed.mimeType);
  const media = await db.contentMedia.create({
    data: {
      postId: post.id,
      position: post._count.media,
      isVideo: processed.isVideo,
      key,
      mimeType: processed.mimeType,
      size: processed.bytes.byteLength,
      filename: (body.filename || `archivo.${processed.ext}`).slice(0, 200),
    },
  });
  return NextResponse.json({ ok: true, media: { id: media.id, key, isVideo: media.isVideo } });
}
