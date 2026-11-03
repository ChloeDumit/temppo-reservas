import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { denyWithoutContentToken } from "@/lib/content/api-auth";

export const dynamic = "force-dynamic";

/** The calendar's posts for one brand, newest date last. */
export async function GET(request: NextRequest) {
  const denied = denyWithoutContentToken(request);
  if (denied) return denied;
  const brand = request.nextUrl.searchParams.get("brand") === "temppo" ? "temppo" : "beauty";
  const posts = await db.contentPost.findMany({
    where: { brand },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { media: true } } },
  });
  return NextResponse.json({
    posts: posts.map((p) => ({
      id: p.id,
      title: p.title,
      kind: p.kind,
      channel: p.channel,
      status: p.status,
      scheduledAt: p.scheduledAt,
      media: p._count.media,
      permalink: p.permalink,
      error: p.error,
    })),
  });
}

const upsertSchema = z.object({
  brand: z.enum(["beauty", "temppo"]).default("beauty"),
  title: z.string().trim().min(1).max(120),
  kind: z.enum(["POST", "CAROUSEL", "REEL", "STORY"]),
  channel: z.enum(["INSTAGRAM", "MANUAL"]).default("INSTAGRAM"),
  caption: z.string().max(2200).default(""),
  notes: z.string().max(2000).optional(),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
});

/**
 * Creates a post, or updates the one with the same title and brand — so
 * pushing a plan twice changes nothing it already did. A post already
 * published or being published is left alone.
 */
export async function POST(request: NextRequest) {
  const denied = denyWithoutContentToken(request);
  if (denied) return denied;
  const parsed = upsertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  const { brand, title, scheduledAt, ...fields } = parsed.data;
  const data = { ...fields, notes: fields.notes?.trim() || null, scheduledAt: scheduledAt ? new Date(scheduledAt) : null };

  const existing = await db.contentPost.findFirst({ where: { brand, title } });
  if (existing) {
    if (existing.status === "PUBLISHED" || existing.status === "PUBLISHING") {
      return NextResponse.json({ post: { id: existing.id, status: existing.status }, unchanged: true });
    }
    const post = await db.contentPost.update({ where: { id: existing.id }, data });
    return NextResponse.json({ post: { id: post.id, status: post.status }, created: false });
  }
  const post = await db.contentPost.create({ data: { brand, title, ...data, createdById: "content-api" } });
  return NextResponse.json({ post: { id: post.id, status: post.status }, created: true }, { status: 201 });
}
