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

/**
 * How long one sweep waits for Instagram to process a video. Short on
 * purpose: the host cuts a request off well before a minute, and a video
 * that is not ready is finished by the next sweep from its saved container.
 */
const WAIT_MS = Number(process.env.INSTAGRAM_WAIT_MS ?? 8_000);
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
  if (m.isVideo || post.kind === "REEL") return { media_type: "REELS", video_url: url, caption: post.caption, share_to_feed: "true", ...collaboratorParams(post) };
  return { image_url: url, caption: post.caption, ...collaboratorParams(post) };
}

/** Feed posts, reels and carousels take collaborators; stories do not. */
function collaboratorParams(post: Post): Record<string, string> {
  return post.collaborators.length ? { collaborators: JSON.stringify(post.collaborators) } : {};
}

/**
 * The post's own container. If Instagram refuses it over a collaborator (an
 * account that does not exist, is private, or cannot be invited), the post
 * goes up anyway without them: they are a bonus, not the post.
 */
async function createPostContainer(account: string, post: Post, params: Record<string, string>) {
  try {
    return await createContainer(account, params);
  } catch (error) {
    if (!params.collaborators) throw error;
    const { collaborators: _dropped, ...without } = params;
    console.warn("[content] collaborators refused, publishing without them", post.id, (error as Error).message);
    return createContainer(account, without);
  }
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

/**
 * Kept the moment Instagram hands it over, before any waiting: if the request
 * is cut off while the video processes, the next sweep picks up this container
 * instead of starting over (which is how a reel once stayed «publicando»).
 */
async function saveContainer(postId: string, container: string) {
  await db.contentPost.update({ where: { id: postId }, data: { igContainerId: container, error: null } });
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
  await notifyContentPublished(post);
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
      await saveContainer(post.id, container);
    } else if (!container) {
      container = await createPostContainer(account, post, mediaParams(post.media[0], post, false));
      await saveContainer(post.id, container);
    }

    if (container.startsWith("children:")) {
      const children = container.slice("children:".length).split(",");
      if ((await waitFor(children, deadline)) === "pending") {
        await db.contentPost.update({ where: { id: post.id }, data: { igContainerId: container, error: null } });
        return "processing";
      }
      container = await createPostContainer(account, post, { media_type: "CAROUSEL", children: children.join(","), caption: post.caption, ...collaboratorParams(post) });
      await saveContainer(post.id, container);
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

/**
 * The account's latest posts with this post's caption, if one went up after
 * it was created — so a post cut off right after Instagram published it is
 * not published twice.
 */
export async function findOnInstagram(post: Pick<ContentPost, "brand" | "caption" | "createdAt">) {
  const account = instagramAccountFor(post.brand);
  if (!account || !post.caption.trim()) return null;
  const res = await graph(`${account}/media`, { fields: "id,caption,permalink,timestamp", limit: "15" });
  const items = (res.data ?? []) as { id: string; caption?: string; permalink?: string; timestamp?: string }[];
  const same = (c?: string) => (c ?? "").trim() === post.caption.trim();
  const hit = items.find((m) => same(m.caption) && (!m.timestamp || new Date(m.timestamp) >= post.createdAt));
  return hit ? { id: hit.id, permalink: hit.permalink ?? null, at: hit.timestamp ? new Date(hit.timestamp) : new Date() } : null;
}

/**
 * Frees a post stuck «publicando» (or failed): if it did reach Instagram it is
 * marked published with its link; if not, it goes back to «Lista» to be
 * scheduled again.
 */
export async function resetPost(postId: string): Promise<{ status: "PUBLISHED" | "READY"; permalink?: string | null } | { error: string; httpStatus: number }> {
  const post = await db.contentPost.findUnique({ where: { id: postId } });
  if (!post) return { error: "post not found", httpStatus: 404 };
  if (post.status === "PUBLISHED") return { error: "Ya se publicó", httpStatus: 409 };
  if (post.status === "PUBLISHING" && post.updatedAt.getTime() > Date.now() - 5 * 60_000) {
    return { error: "Se está publicando ahora mismo: esperá unos minutos", httpStatus: 409 };
  }
  if (post.channel === "INSTAGRAM" && (post.status === "PUBLISHING" || post.status === "FAILED")) {
    const found = await findOnInstagram(post).catch(() => null);
    if (found) {
      await db.contentPost.update({
        where: { id: post.id },
        data: { status: "PUBLISHED", igMediaId: found.id, permalink: found.permalink, publishedAt: found.at, error: null },
      });
      return { status: "PUBLISHED", permalink: found.permalink };
    }
  }
  await db.contentPost.update({ where: { id: post.id }, data: { status: "READY", igContainerId: null, attempts: 0, error: null } });
  return { status: "READY" };
}

/**
 * What publishing needs. Missing any of these is what Graph reports as
 * "Application does not have permission for this action" — a sentence that
 * names neither the permission nor the app.
 */
const REQUIRED_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
];

export type InstagramDiagnosis = {
  /** What the configured id is, if anything. */
  configuredId: string | null;
  /** Permissions the token carries, when they can be read. */
  scopes: string[] | null;
  /** Of the required ones, those the token does not have. */
  missingScopes: string[];
  /** When the token runs out. Null for one that does not expire. */
  expiresAt: Date | null;
  /** Instagram business accounts this token can actually reach. */
  reachable: { pageName: string; igId: string; username: string }[];
  /** What to do, in the order worth trying. */
  findings: string[];
};

/**
 * Turns "Object with ID does not exist" into something actionable.
 *
 * Graph answers that for every reason at once — a wrong id, an account the
 * token was never granted, an Instagram profile that is still personal — so
 * the message alone cannot be acted on. This asks the token what it can
 * reach and compares that with what is configured.
 *
 * Every failure is reported rather than thrown: this runs precisely when
 * something is already broken.
 */
export async function diagnoseInstagram(brand: string): Promise<InstagramDiagnosis> {
  const configuredId =
    (brand === "temppo" ? process.env.INSTAGRAM_USER_ID_TEMPPO : process.env.INSTAGRAM_USER_ID_BEAUTY) ??
    null;
  const findings: string[] = [];
  const reachable: InstagramDiagnosis["reachable"] = [];
  let scopes: string[] | null = null;
  let missingScopes: string[] = [];
  let expiresAt: Date | null = null;

  const token = process.env.INSTAGRAM_TOKEN;
  if (!token) {
    findings.push("Falta INSTAGRAM_TOKEN.");
    return { configuredId, reachable, findings, scopes, missingScopes, expiresAt };
  }

  /*
    What the token is actually allowed to do. Checked first because a missing
    scope explains both failures people hit here: publishing is refused for
    lack of permission, and an account the token cannot see reads back as an
    object that does not exist.
  */
  try {
    const debug = (await graph("debug_token", { input_token: token })) as {
      data?: { scopes?: string[]; expires_at?: number; is_valid?: boolean; app_id?: string };
    };
    const info = debug.data ?? {};
    scopes = info.scopes ?? null;
    if (info.is_valid === false) findings.push("El token ya no es válido. Generá uno nuevo.");
    if (info.expires_at) expiresAt = new Date(info.expires_at * 1000);
    if (expiresAt && expiresAt.getTime() < Date.now()) {
      findings.push(`El token venció el ${expiresAt.toLocaleDateString("es-UY")}.`);
    }
    if (scopes) {
      missingScopes = REQUIRED_SCOPES.filter((scope) => !scopes!.includes(scope));
      if (missingScopes.length > 0) {
        findings.push(
          `Al token le faltan permisos: ${missingScopes.join(", ")}. Volvé a generarlo pidiéndolos.`,
        );
      }
    }
  } catch (error) {
    findings.push(`No se pudieron leer los permisos del token: ${(error as Error).message}`);
  }

  if (!configuredId) {
    findings.push(
      `Falta INSTAGRAM_USER_ID_${brand === "temppo" ? "TEMPPO" : "BEAUTY"}.`,
    );
  }

  /*
    The pages the token administers, with the Instagram business account
    linked to each. This is where the right id comes from: an Instagram
    profile that is still personal, or not linked to a page, simply does not
    appear — which is the answer to half the cases.
  */
  try {
    const pages = (await graph("me/accounts", {
      fields: "name,instagram_business_account{id,username}",
      limit: "50",
    })) as { data?: { name?: string; instagram_business_account?: { id?: string; username?: string } }[] };

    for (const page of pages.data ?? []) {
      const ig = page.instagram_business_account;
      if (ig?.id) {
        reachable.push({
          pageName: String(page.name ?? ""),
          igId: String(ig.id),
          username: String(ig.username ?? ""),
        });
      }
    }

    if ((pages.data ?? []).length === 0) {
      findings.push(
        "El token no administra ninguna página. Si es un System User, asignale la página en Business Manager con permiso de contenido.",
      );
    } else if (reachable.length === 0) {
      findings.push(
        "El token ve páginas, pero ninguna tiene una cuenta de Instagram vinculada. La cuenta tiene que ser Empresa o Creador y estar vinculada a una página de Facebook.",
      );
    }
  } catch (error) {
    findings.push(`No se pudieron listar las páginas: ${(error as Error).message}`);
  }

  if (configuredId && reachable.length > 0) {
    const match = reachable.find((r) => r.igId === configuredId);
    if (match) {
      findings.push(
        `El id configurado corresponde a @${match.username}. Si igual falla, el token no tiene permiso de publicar en esa cuenta.`,
      );
    } else {
      findings.push(
        `El id configurado (${configuredId}) no está entre las cuentas que este token alcanza. Usá uno de los de abajo.`,
      );
    }
  }

  /*
    Advanced Access is the other half of a permission error: an app still in
    development can only post to accounts whose owner has a role in it, and
    Graph reports that the same way as a missing scope.
  */
  if (missingScopes.length === 0 && findings.some((f) => f.includes("permiso"))) {
    findings.push(
      "Si los permisos están y igual falla, revisá que la app tenga Acceso avanzado a instagram_content_publish, o que la cuenta tenga un rol en la app.",
    );
  }

  return { configuredId, reachable, findings, scopes, missingScopes, expiresAt };
}
