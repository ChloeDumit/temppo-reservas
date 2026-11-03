import "server-only";
import { db } from "@/lib/db";
import { localePath, routing } from "@/i18n/routing";
import { notifyPreferred } from "@/lib/notifications";

/*
  Tells whoever runs the platform that a post went up on Instagram, or could
  not, so they can look at it. Push to their phone when they have turned
  notifications on, and email always.

  Unlike notifyPlatformAdmins, this does push: the post is something to go
  and look at now, and tapping the notification opens it in the console.
  The log row is filed under the admin's own studio — the notification log is
  tenant-scoped, and a post belongs to no studio.
*/

type Published = { id: string; title: string; permalink: string | null };

function consoleUrl(id: string) {
  return `${(process.env.APP_URL || "").replace(/\/$/, "")}${localePath(routing.defaultLocale, `/admin/content/${id}`)}`;
}

async function admins() {
  return db.user.findMany({
    where: { isPlatformAdmin: true, isActive: true },
    select: { id: true, email: true, studioId: true },
  });
}

export async function notifyContentPublished(post: Published) {
  for (const admin of await admins()) {
    await notifyPreferred({
      studioId: admin.studioId,
      to: admin.email,
      userId: admin.id,
      url: `/admin/content/${post.id}`,
      template: "content_published",
      subject: `Publicado en Instagram — ${post.title}`,
      body: `Se publicó «${post.title}» en Instagram.${post.permalink ? `\n\nMirala: ${post.permalink}` : ""}\n\nEn la consola: ${consoleUrl(post.id)}`,
      relatedType: "ContentPost",
      relatedId: post.id,
    }).catch((error) => console.error("[content] notify failed", error));
  }
}

export async function notifyContentFailed(post: { id: string; title: string }, error: string) {
  for (const admin of await admins()) {
    await notifyPreferred({
      studioId: admin.studioId,
      to: admin.email,
      userId: admin.id,
      url: `/admin/content/${post.id}`,
      template: "content_failed",
      subject: `No se pudo publicar — ${post.title}`,
      body: `«${post.title}» no se pudo publicar en Instagram.\n\nMotivo: ${error}\n\nRevisala y volvé a programarla: ${consoleUrl(post.id)}`,
      relatedType: "ContentPost",
      relatedId: post.id,
    }).catch((e) => console.error("[content] notify failed", e));
  }
}
