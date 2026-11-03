import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { denyWithoutContentToken } from "@/lib/content/api-auth";
import { deleteMedia } from "@/lib/content/storage";

export const dynamic = "force-dynamic";

/** Removes a post's files, to upload them again in a new order. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = denyWithoutContentToken(request);
  if (denied) return denied;
  const { id } = await params;
  const post = await db.contentPost.findUnique({ where: { id }, include: { media: true } });
  if (!post) return NextResponse.json({ error: "post not found" }, { status: 404 });
  if (post.status === "PUBLISHED" || post.status === "PUBLISHING") return NextResponse.json({ error: "Ya se publicó" }, { status: 409 });
  await Promise.all(post.media.map((m) => deleteMedia(m.key).catch(() => {})));
  await db.contentMedia.deleteMany({ where: { postId: post.id } });
  return NextResponse.json({ ok: true, removed: post.media.length });
}
