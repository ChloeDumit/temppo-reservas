import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { denyWithoutContentToken } from "@/lib/content/api-auth";
import { schedulePost } from "@/lib/content/schedule";

export const dynamic = "force-dynamic";

/** Schedules a post at its time, or at the `scheduledAt` given. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = denyWithoutContentToken(request);
  if (denied) return denied;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { scheduledAt?: string };
  const post = await db.contentPost.findUnique({ where: { id }, select: { scheduledAt: true } });
  if (!post) return NextResponse.json({ error: "post not found" }, { status: 404 });
  const at = body.scheduledAt ? new Date(body.scheduledAt) : post.scheduledAt;
  if (!at) return NextResponse.json({ error: "La publicación no tiene fecha" }, { status: 400 });
  const result = await schedulePost(id, at);
  return "error" in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json({ ok: true, scheduledAt: at });
}
