import { NextRequest, NextResponse } from "next/server";
import { getMedia } from "@/lib/content/storage";

export const dynamic = "force-dynamic";

/**
 * The platform's post media, public: Instagram's publishing API fetches each
 * file from here. Keys are random and never listed, and only finished media
 * is served (an upload's parts live under another prefix).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  if (!key.startsWith("media/")) return NextResponse.json({ error: "not found" }, { status: 404 });
  const file = await getMedia(key);
  if (!file) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(Buffer.from(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.bytes.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
