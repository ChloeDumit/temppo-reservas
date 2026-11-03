import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/*
  Where the platform's own posts keep their images and videos. Instagram's
  publishing API does not take uploads: it fetches each file from a public
  URL, so the files live here and /api/content-media/<key> serves them.

  On Netlify: Netlify Blobs, which comes with the site and needs no account.
  Anywhere else: a folder in the project (.content-media, git-ignored), so
  the console works on a laptop without Netlify's runtime.
*/

const STORE = "content-media";
const LOCAL_DIR = path.join(process.cwd(), ".content-media");

function onNetlify() {
  return Boolean(process.env.NETLIFY_BLOBS_CONTEXT || process.env.NETLIFY);
}

async function blobStore() {
  const { getStore } = await import("@netlify/blobs");
  return getStore({ name: STORE, consistency: "strong" });
}

/** Keys are ours (cuid-based), but never let one climb out of the folder. */
function localPath(key: string) {
  const safe = key.replace(/[^a-zA-Z0-9/_.-]/g, "").replace(/\.\.+/g, ".");
  return path.join(LOCAL_DIR, safe);
}

export async function putMedia(key: string, bytes: Uint8Array, contentType: string) {
  if (onNetlify()) {
    const store = await blobStore();
    await store.set(key, new Blob([new Uint8Array(bytes)], { type: contentType }), { metadata: { contentType } });
    return;
  }
  const file = localPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  await writeFile(`${file}.type`, contentType);
}

export async function getMedia(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (onNetlify()) {
    const store = await blobStore();
    const entry = await store.getWithMetadata(key, { type: "arrayBuffer" });
    if (!entry) return null;
    const contentType = (entry.metadata?.contentType as string) || "application/octet-stream";
    return { bytes: new Uint8Array(entry.data), contentType };
  }
  try {
    const file = localPath(key);
    const [bytes, contentType] = await Promise.all([readFile(file), readFile(`${file}.type`, "utf8").catch(() => "application/octet-stream")]);
    return { bytes: new Uint8Array(bytes), contentType };
  } catch {
    return null;
  }
}

export async function deleteMedia(key: string) {
  if (onNetlify()) {
    const store = await blobStore();
    await store.delete(key);
    return;
  }
  const file = localPath(key);
  await rm(file, { force: true });
  await rm(`${file}.type`, { force: true });
}

/** Removes every key under a prefix (an abandoned upload's parts). */
export async function deletePrefix(prefix: string) {
  if (onNetlify()) {
    const store = await blobStore();
    const { blobs } = await store.list({ prefix });
    await Promise.all(blobs.map((b) => store.delete(b.key)));
    return;
  }
  await rm(localPath(prefix), { recursive: true, force: true });
}
