import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const STAFF = ["OWNER", "ADMIN", "INSTRUCTOR"];

/**
 * The bell in the staff panel polls this. Only ever the signed-in person's
 * own items, newest first, and how many are unread.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !STAFF.includes(user.role)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [items, unread] = await Promise.all([
    db.inboxItem.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, kind: true, title: true, body: true, url: true, readAt: true, createdAt: true },
    }),
    db.inboxItem.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return NextResponse.json({ items, unread }, { headers: { "Cache-Control": "no-store" } });
}

/** Marks everything, or the given items, as read. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !STAFF.includes(user.role)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === "string").slice(0, 100) : null;
  await db.inboxItem.updateMany({
    where: { userId: user.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
