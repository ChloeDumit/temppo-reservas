import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { deletePrefix, getMedia, putMedia } from "./storage";
import { PART_BYTES, processUpload } from "./media";

/*
  Uploading a post's file in parts, shared by the console (signed-in admin)
  and the content API (token): a function only takes a few MB per request and
  a reel can be much more, so each part is stored on its own and the last call
  stitches them together, turns images into JPEG and attaches the file.
*/

export const UPLOAD_ID = /^[0-9a-f-]{36}$/;
type Failure = { error: string; status: number };

const partKey = (uploadId: string, part: number) => `uploads/${uploadId}/${String(part).padStart(4, "0")}`;

export async function savePart(uploadId: string, part: number, bytes: Uint8Array): Promise<{ ok: true } | Failure> {
  if (!UPLOAD_ID.test(uploadId)) return { error: "bad upload id", status: 400 };
  if (!Number.isInteger(part) || part < 0 || part > 200) return { error: "bad part", status: 400 };
  if (!bytes.byteLength || bytes.byteLength > PART_BYTES + 1024) return { error: "bad part size", status: 400 };
  await putMedia(partKey(uploadId, part), bytes, "application/octet-stream");
  return { ok: true };
}

export async function finishUpload(params: {
  uploadId: string;
  postId?: string;
  filename?: string;
  mimeType?: string;
  parts?: number;
}): Promise<{ media: { id: string; key: string; isVideo: boolean } } | Failure> {
  const { uploadId, postId, mimeType, parts } = params;
  if (!UPLOAD_ID.test(uploadId)) return { error: "bad upload id", status: 400 };
  if (!postId || !mimeType || !parts) return { error: "missing fields", status: 400 };

  const post = await db.contentPost.findUnique({ where: { id: postId }, select: { id: true, status: true, _count: { select: { media: true } } } });
  if (!post) return { error: "post not found", status: 404 };
  if (post.status === "PUBLISHED" || post.status === "PUBLISHING") {
    return { error: "Ya se está publicando: no se le pueden cambiar los archivos", status: 409 };
  }

  const chunks: Uint8Array[] = [];
  for (let i = 0; i < parts; i++) {
    const part = await getMedia(partKey(uploadId, i));
    if (!part) return { error: `missing part ${i}`, status: 400 };
    chunks.push(part.bytes);
  }
  const whole = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let offset = 0;
  for (const c of chunks) {
    whole.set(c, offset);
    offset += c.byteLength;
  }
  await deletePrefix(`uploads/${uploadId}`);

  const processed = await processUpload(whole, mimeType);
  if ("error" in processed) return { error: processed.error, status: 400 };

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
      filename: (params.filename || `archivo.${processed.ext}`).slice(0, 200),
    },
  });
  return { media: { id: media.id, key, isVideo: media.isVideo } };
}
