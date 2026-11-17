import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * A professional's photo. Public on purpose: the booking page shows it to
 * people who are not signed in. The stored URL carries a version, so a new
 * upload gets a new address and the old one can be cached for good.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const photo = await db.staffPhoto.findUnique({ where: { userId } });
  if (!photo) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
