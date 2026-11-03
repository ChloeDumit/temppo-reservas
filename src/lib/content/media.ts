import "server-only";

/*
  What an uploaded file becomes before Instagram sees it. Instagram's API
  takes JPEG images only (up to 8 MB) and MP4 or MOV videos, so a PNG or WebP
  — every image the marketing scripts export is a PNG — is turned into a
  JPEG here, on a white background where it was transparent.
*/

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const VIDEO_TYPES = ["video/mp4", "video/quicktime"];
/** Instagram's own limits: 8 MB for an image, 300 MB for a reel. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 300 * 1024 * 1024;
/** Each upload request carries one part: Netlify functions take up to 6 MB. */
export const PART_BYTES = 4 * 1024 * 1024;

export type Processed = { bytes: Uint8Array; mimeType: string; isVideo: boolean; ext: string };

export async function processUpload(bytes: Uint8Array, mimeType: string): Promise<Processed | { error: string }> {
  if (VIDEO_TYPES.includes(mimeType)) {
    if (bytes.byteLength > MAX_VIDEO_BYTES) return { error: "El video pasa los 300 MB que acepta Instagram" };
    return { bytes, mimeType, isVideo: true, ext: mimeType === "video/quicktime" ? "mov" : "mp4" };
  }
  if (!IMAGE_TYPES.includes(mimeType)) return { error: "Solo imágenes JPG, PNG o WebP, o videos MP4 o MOV" };

  const sharp = (await import("sharp")).default;
  const jpeg = await sharp(bytes)
    .rotate()
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
  if (jpeg.byteLength > MAX_IMAGE_BYTES) return { error: "La imagen pasa los 8 MB que acepta Instagram" };
  return { bytes: new Uint8Array(jpeg), mimeType: "image/jpeg", isVideo: false, ext: "jpg" };
}
