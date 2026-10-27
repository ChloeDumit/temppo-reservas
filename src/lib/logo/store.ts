import "server-only";
import { db } from "@/lib/db";

/*
  A studio's uploaded logo, shared by its own settings and the platform console.
  The bytes live in StudioLogo; Studio.logoUrl holds the address that serves them.
*/

const LOGO_MAX_BYTES = 1024 * 1024;

/** PNG, JPEG and WebP only, told apart by their first bytes rather than trusting the browser. */
function sniffImage(data: Uint8Array) {
  const starts = (...bytes: number[]) => bytes.every((b, i) => data[i] === b);
  if (starts(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...data.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

/**
 * The logo file, if one was picked. The browser already shrinks it to a PNG;
 * SVG is refused here because it would be served from our own origin, where a
 * script inside it could run.
 */
export async function readLogo(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0) return null;
  if (value.size > LOGO_MAX_BYTES) return "tooBig" as const;
  const data = new Uint8Array(await value.arrayBuffer());
  const mimeType = sniffImage(data);
  if (!mimeType) return "invalid" as const;
  return { data, mimeType };
}

/** Stores the logo and returns what Studio.logoUrl should now hold. */
export async function storeLogo(studioId: string, logo: { data: Uint8Array<ArrayBuffer>; mimeType: string }) {
  const data = { data: logo.data, mimeType: logo.mimeType };
  await db.studioLogo.upsert({ where: { studioId }, create: { studioId, ...data }, update: data });
  // A new address per upload, so caches never hold on to the old one.
  return `/api/logo/${studioId}?v=${Date.now().toString(36)}`;
}

export async function deleteLogo(studioId: string) {
  await db.studioLogo.deleteMany({ where: { studioId } });
}
