import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * A studio's uploaded logo. Public on purpose: the booking page and every email
 * show it to people who are not signed in. The stored URL carries a version, so
 * a new upload gets a new address and the old one can be cached for good.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ studioId: string }> }) {
  const { studioId } = await params;
  const logo = await db.studioLogo.findUnique({ where: { studioId } });
  if (!logo) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(logo.data), {
    headers: {
      "Content-Type": logo.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
