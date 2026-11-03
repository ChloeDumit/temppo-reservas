import "server-only";
import { db } from "@/lib/db";
import type { ContentMedia, ContentPost } from "@/generated/prisma/client";
import { notifyContentFailed, notifyContentPublished } from "./notify";

/*
  Publishing the platform's own posts through Instagram's Content Publishing
  API. Instagram never receives a file from us: we create a "container" that
  points at the file's public URL, Instagram fetches and processes it (videos
  take a while), and only then is the container published.

  So a post moves SCHEDULED → PUBLISHING → PUBLISHED. A video still being
  processed when the sweep's time runs out stays PUBLISHING with its container
  id, and the next sweep — fifteen minutes later — finishes it instead of
  uploading it again.

  Configuration (see DEPLOY.md, "Instagram"):
    INSTAGRAM_TOKEN            a System User token with instagram_basic,
                               instagram_content_publish, pages_show_list and
                               pages_read_engagement
    INSTAGRAM_USER_ID_BEAUTY   the Instagram account's id for @temppobeauty
    INSTAGRAM_USER_ID_TEMPPO   the same for TEMPPO Reservas, if it posts
    APP_URL                    public origin the media is served from
*/

const API_VERSION = process.env.INSTAGRAM_API_VERSION || "v23.0";
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;

/** How long one sweep waits for Instagram to process a video. */
const WAIT_MS = Number(process.env.INSTAGRAM_WAIT_MS ?? 40_000);
const POLL_MS = Number(process.env.INSTAGRAM_POLL_MS ?? 5_000);
/** Sweeps a video may stay in processing before we give up (about two hours). */
const MAX_ATTEMPTS = 8;

type Post = ContentPost & { media: ContentMedia[] };

export function instagramAccountFor(brand: string) {
  const id = brand === "temppo" ? process.env.INSTAGRAM_USER_ID_TEMPPO : process.env.INSTAGRAM_USER_ID_BEAUTY;
  return process.env.INSTAGRAM_TOKEN && id ? id : null;
}

export function mediaUrl(key: string) {
  const base = (process.env.APP_URL || "").replace(/\/$/, "");
  return `${base}/api/content-media/${key}`;
}

class InstagramError extends Error {}

async function graph(path: string, params: Record<string, string> = {}, method: "GET" | "POST" = "GET") {
  const token = process.env.INSTAGRAM_TOKEN;
  if (!token) throw new InstagramError("Falta INSTAGRAM_TOKEN");
  const body = new URLSearchParams({ ...params, access_token: token });
  const url = method === "GET" ? `${GRAPH}/${path}?${body}` : `${GRAPH}/${path}`;
  const res = await fetch(url, method === "POST" ? { method, body } : undefined);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: { message?: string; error_user_msg?: string; code?: number };
  };
  if (!res.ok || json.error) {
    const e = json.error;
    throw new InstagramError(`Instagram ${e?.code ?? res.status}: ${e?.error_user_msg || e?.message || "error"}`);
  }
  return json;
}

/** Who the token posts as, for the console to show. */
export async function instagramProfile(brand: string) {
  const id = instagramAccountFor(brand);
  if (!id) return null;
  try {
    const me = await graph(id, { fields: "username,name,profile_picture_url" });
    return { id, username: String(me.username ?? ""), name: String(me.name ?? "") };
  } catch (error) {
    return { id, username: "", name: "", error: String((error as Error).message) };
  }
}

async function createContainer(account: string, params: Record<string, string>) {
  const res = await graph(`${account}/media`, params, "POST");
  return String(res.id);
}

async function containerStatus(container: string) {
  const res = await graph(container, { fields: "status_code,status" });
  return { code: String(res.status_code ?? ""), detail: String(res.status ?? "") };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits until every container is FINISHED, or the time runs out. */
async function waitFor(containers: string[], deadline: number): Promise<"finished" | "pending"> {
  let pending = [...containers];
  for (;;) {
    const states = await Promise.all(pending.map(async (c) => ({ c, s: await containerStatus(c) })));
    const failed = states.find((x) => x.s.code === "ERROR" || x.s.code === "EXPIRED");
    if (failed) throw new InstagramError(`Instagram no pudo procesar el archivo (${failed.s.detail || failed.s.code})`);
    pending = states.filter((x) => x.s.code !== "FINISHED" && x.s.code !== "PUBLISHED").map((x) => x.c);
    if (!pending.length) return "finished";
    if (Date.now() + POLL_MS > deadline) return "pending";
    await sleep(POLL_MS);
  }
}

/** One file as a container: the post itself, or an item of a carousel. */
function mediaParams(m: ContentMedia, post: Post, asItem: boolean): Record<string, string> {
  const url = mediaUrl(m.key);
  if (asItem) return m.isVideo ? { media_type: "VIDEO", video_url: url, is_carousel_item: "true" } : { image_url: url, is_carousel_item: "true" };
  if (post.kind === "STORY") return m.isVideo ? { media_type: "STORIES", video_url: url } : { media_type: "STORIES", image_url: url };
  // Instagram only takes videos in the feed as reels.
  if (m.isVideo || post.kind === "REEL") return { media_type: "REELS", video_url: url, caption: post.caption, share_to_feed: "true" };
  return { image_url: url, caption: post.caption };
}

/** What is wrong with a post before it can go to Instagram, or null. */
export function publishProblem(post: Post): string | null {
  if (post.channel !== "INSTAGRAM") return "Se publica a mano: no va a Instagram desde acá";
  if (!instagramAccountFor(post.brand)) return "Instagram no está conectado (faltan INSTAGRAM_TOKEN o el id de la cuenta)";
  if (!process.env.APP_URL) return "Falta APP_URL: Instagram necesita una URL pública para leer los archivos";
  const n = post.media.length;
  if (!n) return "Falta subir la imagen o el video";
  if (post.kind === "CAROUSEL" && (n < 2 || n > 10)) return "Un carrusel lleva entre 2 y 10 archivos";
  if (post.kind !== "CAROUSEL" && n > 1) return "Este tipo lleva un solo archivo (para varios, elegí Carrusel)";
  if (post.kind === "REEL" && !post.media[0].isVideo) return "Un reel tiene que ser un video";
  if (post.caption.length > 2200) return "El caption pasa los 2.200 caracteres que permite Instagram";
  if ((post.caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length > 30) return "Instagram permite hasta 30 hashtags";
  return null;
}

async function finish(post: Post, account: string, container: string) {
  const published = await graph(`${account}/media_publish`, { creation_id: container }, "POST");
  const mediaId = String(published.id);
  const link = await graph(mediaId, { fields: "permalink" }).catch(() => ({ permalink: null }));
  await db.contentPost.update({
    where: { id: post.id },
    data: {
      status: "PUBLISHED",
      igMediaId: mediaId,
      igContainerId: container,
      permalink: (link.permalink as string | null) ?? null,
      publishedAt: new Date(),
      error: null,
    },
  });
  await notifyContentPublished({ id: post.id, title: post.title, permalink: (link.permalink as string | null) ?? null });
  return "published" as const;
}

/**
 * Takes a post one step further on Instagram. Safe to call twice at once:
 * a post is claimed before anything is sent, and a second caller finds it
 * already taken.
 */
export async function publishToInstagram(postId: string, { now = new Date(), wait = WAIT_MS } = {}): Promise<"published" | "processing" | "failed" | "skipped"> {
  const post = await db.contentPost.findUnique({ where: { id: postId }, include: { media: { orderBy: { position: "asc" } } } });
  if (!post || post.status === "PUBLISHED") return "skipped";

  // The claim: only one sweep, or one click, works on a post at a time.
  const claimed = await db.contentPost.updateMany({
    where: { id: post.id, status: post.status, attempts: post.attempts },
    data: { status: "PUBLISHING", attempts: { increment: 1 } },
  });
  if (!claimed.count) return "skipped";

  const fail = async (message: string) => {
    await db.contentPost.update({ where: { id: post.id }, data: { status: "FAILED", error: message.slice(0, 500) } });
    await notifyContentFailed(post, message);
    return "failed" as const;
  };

  const problem = publishProblem(post);
  if (problem) return fail(problem);
  if (post.attempts + 1 > MAX_ATTEMPTS) return fail("Instagram tardó demasiado en procesar el video. Probá de nuevo.");

  const account = instagramAccountFor(post.brand)!;
  const deadline = now.getTime() + wait;
  try {
    let container = post.igContainerId;

    // A carousel's items are containers too, and must be ready first.
    if (!container && post.kind === "CAROUSEL") {
      const children = [];
      for (const m of post.media) children.push(await createContainer(account, mediaParams(m, post, true)));
      container = `children:${children.join(",")}`;
    } else if (!container) {
      container = await createContainer(account, mediaParams(post.media[0], post, false));
    }

    if (container.startsWith("children:")) {
      const children = container.slice("children:".length).split(",");
      if ((await waitFor(children, deadline)) === "pending") {
        await db.contentPost.update({ where: { id: post.id }, data: { igContainerId: container, error: null } });
        return "processing";
      }
      container = await createContainer(account, { media_type: "CAROUSEL", children: children.join(","), caption: post.caption });
    }

    if ((await waitFor([container], deadline)) === "pending") {
      await db.contentPost.update({ where: { id: post.id }, data: { igContainerId: container, error: null } });
      return "processing";
    }
    return await finish(post, account, container);
  } catch (error) {
    return fail(error instanceof InstagramError ? error.message : `Error al publicar: ${String(error)}`);
  }
}

/**
 * The sweep's part: posts whose time has come, and videos Instagram was still
 * processing last time. A few per sweep, so one slow video cannot use up the
 * cron's minute.
 */
export async function publishDueContent(now = new Date(), limit = 3) {
  const due = await db.contentPost.findMany({
    where: {
      channel: "INSTAGRAM",
      OR: [
        { status: "SCHEDULED", scheduledAt: { lte: now } },
        { status: "PUBLISHING", igContainerId: { not: null } },
        // Claimed and then cut off before Instagram heard of it: try again.
        { status: "PUBLISHING", igContainerId: null, updatedAt: { lt: new Date(now.getTime() - 10 * 60_000) } },
      ],
    },
    orderBy: { scheduledAt: "asc" },
    take: limit,
    select: { id: true },
  });
  const result = { published: 0, processing: 0, failed: 0 };
  for (const { id } of due) {
    const outcome = await publishToInstagram(id, { now });
    if (outcome === "published") result.published++;
    if (outcome === "processing") result.processing++;
    if (outcome === "failed") result.failed++;
  }
  return result;
}
