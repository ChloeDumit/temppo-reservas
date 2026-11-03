"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertPlatformAdmin } from "@/lib/auth/guards";
import { localePath } from "@/i18n/routing";
import { wallTimeToUtc } from "@/lib/dates";
import { getAdminProduct } from "@/lib/admin/product";
import { deleteMedia } from "@/lib/content/storage";
import { publishProblem, publishToInstagram } from "@/lib/content/instagram";
import { CONTENT_PLANS } from "@/lib/content/plan-noviembre";

/*
  The content calendar's actions. Like the rest of the console, each one
  re-checks the platform flag and ends by redirecting to the page it came
  from, so what changed is on screen straight away.
*/

const TZ = "America/Montevideo";

async function back(path: string): Promise<never> {
  revalidatePath("/", "layout");
  redirect(localePath(await getLocale(), path));
}

const editorPath = (id: string, flash?: string) => `/admin/content/${id}${flash ? `?m=${encodeURIComponent(flash)}` : ""}`;

/** "2026-11-04T19:30" from a datetime-local input, read as Montevideo time. */
function parseLocal(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const [date, time] = value.split("T");
  return wallTimeToUtc(date, time, TZ);
}

async function loadPost(id: unknown) {
  if (typeof id !== "string") return null;
  return db.contentPost.findUnique({ where: { id }, include: { media: { orderBy: { position: "asc" } } } });
}

export async function createContentPostAction(formData: FormData) {
  const admin = await assertPlatformAdmin();
  const brand = await getAdminProduct();
  const date = typeof formData.get("date") === "string" ? String(formData.get("date")) : "";
  const post = await db.contentPost.create({
    data: {
      brand,
      title: "Nueva publicación",
      createdById: admin.id,
      scheduledAt: /^\d{4}-\d{2}-\d{2}$/.test(date) ? wallTimeToUtc(date, "19:30", TZ) : null,
    },
  });
  await back(editorPath(post.id));
}

const editSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  kind: z.enum(["POST", "CAROUSEL", "REEL", "STORY"]),
  channel: z.enum(["INSTAGRAM", "MANUAL"]),
  caption: z.string().max(2200).default(""),
  notes: z.string().max(2000).optional(),
});

/** Saves the form; `intent` says what else to do with it. */
export async function saveContentPostAction(formData: FormData) {
  await assertPlatformAdmin();
  const parsed = editSchema.safeParse(Object.fromEntries(formData));
  const post = await loadPost(formData.get("id"));
  if (!post) return back("/admin/content");
  if (!parsed.success) return back(editorPath(post.id, "Revisá los campos: el título es obligatorio y el caption tiene hasta 2.200 caracteres."));
  if (post.status === "PUBLISHED" || post.status === "PUBLISHING") return back(editorPath(post.id, "Ya se publicó o se está publicando: no se puede cambiar."));

  const scheduledAt = parseLocal(formData.get("scheduledAt"));
  const intent = String(formData.get("intent") ?? "save");
  const data = {
    title: parsed.data.title,
    kind: parsed.data.kind,
    channel: parsed.data.channel,
    caption: parsed.data.caption.replace(/\r\n/g, "\n"),
    notes: parsed.data.notes?.trim() || null,
    scheduledAt,
  };
  await db.contentPost.update({ where: { id: post.id }, data });
  const updated = (await loadPost(post.id))!;

  if (intent === "idea" || intent === "ready") {
    await db.contentPost.update({ where: { id: post.id }, data: { status: intent === "idea" ? "IDEA" : "READY", error: null } });
    return back(editorPath(post.id, "Guardado."));
  }

  if (intent === "schedule") {
    if (!scheduledAt) return back(editorPath(post.id, "Elegí el día y la hora."));
    if (scheduledAt.getTime() < Date.now() + 5 * 60_000) return back(editorPath(post.id, "La hora tiene que ser al menos 5 minutos más adelante. Para ahora, usá «Publicar ahora»."));
    if (updated.channel === "INSTAGRAM") {
      const problem = publishProblem(updated);
      if (problem) return back(editorPath(post.id, problem));
    }
    await db.contentPost.update({ where: { id: post.id }, data: { status: "SCHEDULED", error: null, igContainerId: null, attempts: 0 } });
    return back(editorPath(post.id, updated.channel === "INSTAGRAM" ? "Programado: se publica solo a esa hora (con hasta 15 minutos de margen)." : "Agendado: es un recordatorio para publicarlo a mano."));
  }

  if (intent === "publish") {
    const problem = publishProblem(updated);
    if (problem) return back(editorPath(post.id, problem));
    await db.contentPost.update({ where: { id: post.id }, data: { status: "SCHEDULED", scheduledAt: new Date(), error: null, igContainerId: null, attempts: 0 } });
    const outcome = await publishToInstagram(post.id, { wait: 45_000 });
    const message =
      outcome === "published"
        ? "¡Publicado en Instagram!"
        : outcome === "processing"
          ? "Instagram está procesando el video: se termina de publicar solo en los próximos minutos."
          : outcome === "failed"
            ? "No se pudo publicar: mirá el error abajo."
            : "No se pudo tomar la publicación. Probá de nuevo.";
    return back(editorPath(post.id, message));
  }

  return back(editorPath(post.id, "Guardado."));
}

/** For what goes up by hand (TikTok, or a reel with an in-app audio). */
export async function markPublishedAction(formData: FormData) {
  await assertPlatformAdmin();
  const post = await loadPost(formData.get("id"));
  if (!post) return back("/admin/content");
  const link = String(formData.get("permalink") ?? "").trim();
  await db.contentPost.update({
    where: { id: post.id },
    data: { status: "PUBLISHED", publishedAt: new Date(), permalink: /^https?:\/\//.test(link) ? link : post.permalink, error: null },
  });
  return back(editorPath(post.id, "Marcado como publicado."));
}

/** Back from scheduled or failed to ready, to change it. */
export async function unscheduleAction(formData: FormData) {
  await assertPlatformAdmin();
  const post = await loadPost(formData.get("id"));
  if (!post) return back("/admin/content");
  if (post.status === "SCHEDULED" || post.status === "FAILED") {
    await db.contentPost.update({ where: { id: post.id }, data: { status: "READY", igContainerId: null, attempts: 0 } });
  }
  return back(editorPath(post.id, "Volvió a «Lista»: ya no se publica sola."));
}

export async function duplicateContentPostAction(formData: FormData) {
  const admin = await assertPlatformAdmin();
  const post = await loadPost(formData.get("id"));
  if (!post) return back("/admin/content");
  const copy = await db.contentPost.create({
    data: {
      brand: post.brand,
      title: `${post.title} (copia)`,
      kind: post.kind,
      channel: post.channel,
      caption: post.caption,
      notes: post.notes,
      scheduledAt: post.scheduledAt,
      createdById: admin.id,
    },
  });
  return back(editorPath(copy.id, "Copia creada, sin archivos: subilos de nuevo si los necesitás."));
}

export async function deleteContentPostAction(formData: FormData) {
  await assertPlatformAdmin();
  const post = await loadPost(formData.get("id"));
  if (!post) return back("/admin/content");
  await Promise.all(post.media.map((m) => deleteMedia(m.key).catch(() => {})));
  await db.contentPost.delete({ where: { id: post.id } });
  return back("/admin/content");
}

export async function removeMediaAction(formData: FormData) {
  await assertPlatformAdmin();
  const media = await db.contentMedia.findUnique({ where: { id: String(formData.get("mediaId") ?? "") }, include: { post: true } });
  if (!media) return back("/admin/content");
  if (media.post.status === "PUBLISHED" || media.post.status === "PUBLISHING") return back(editorPath(media.postId, "Ya se publicó: no se pueden sacar archivos."));
  await deleteMedia(media.key).catch(() => {});
  await db.contentMedia.delete({ where: { id: media.id } });
  const rest = await db.contentMedia.findMany({ where: { postId: media.postId }, orderBy: { position: "asc" } });
  await Promise.all(rest.map((m, i) => db.contentMedia.update({ where: { id: m.id }, data: { position: i } })));
  return back(editorPath(media.postId));
}

/** Swaps a carousel item with its neighbour. */
export async function moveMediaAction(formData: FormData) {
  await assertPlatformAdmin();
  const media = await db.contentMedia.findUnique({ where: { id: String(formData.get("mediaId") ?? "") } });
  if (!media) return back("/admin/content");
  const dir = formData.get("dir") === "up" ? -1 : 1;
  const all = await db.contentMedia.findMany({ where: { postId: media.postId }, orderBy: { position: "asc" } });
  const i = all.findIndex((m) => m.id === media.id);
  const j = i + dir;
  if (j >= 0 && j < all.length) {
    await db.$transaction([
      db.contentMedia.update({ where: { id: all[i].id }, data: { position: j } }),
      db.contentMedia.update({ where: { id: all[j].id }, data: { position: i } }),
    ]);
  }
  return back(editorPath(media.postId));
}

/** Creates a plan's posts, once: posts already there by title are left alone. */
export async function loadPlanAction(formData: FormData) {
  const admin = await assertPlatformAdmin();
  const plan = CONTENT_PLANS.find((p) => p.id === formData.get("plan"));
  if (!plan) return back("/admin/content");
  let created = 0;
  for (const item of plan.items) {
    const exists = await db.contentPost.findFirst({ where: { brand: "beauty", title: item.title } });
    if (exists) continue;
    await db.contentPost.create({
      data: {
        brand: "beauty",
        title: item.title,
        kind: item.kind,
        caption: item.caption,
        notes: item.notes,
        scheduledAt: item.date ? wallTimeToUtc(item.date, item.time, TZ) : null,
        createdById: admin.id,
      },
    });
    created++;
  }
  return back(`/admin/content?m=${encodeURIComponent(created ? `${plan.label}: ${created} publicaciones cargadas. Subí los archivos de cada una y programalas.` : "Ese plan ya estaba cargado.")}`);
}
