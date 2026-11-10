import "server-only";
import { db } from "@/lib/db";
import { brandByKey } from "@/lib/brand/registry";
import { pushToUser, type PushMessage } from "@/lib/notifications/push";

/*
  Tells whoever runs the platform that a post went up on Instagram, or could
  not, so they can look at it. A push to their phone only — no email, by
  choice: this is a "go and look now", and the console has the full story.
  Tapping it opens the post in the console. An admin who has not turned
  notifications on in the app hears nothing; the console still shows it.
*/

/** The sender, swappable so the checks can see what would be pushed. */
export const contentPush = { send: (userId: string, message: PushMessage) => pushToUser(userId, message) };

async function pushAdmins(brandKey: string, message: Omit<PushMessage, "icon" | "badge">) {
  const brand = brandByKey(brandKey);
  const admins = await db.user.findMany({ where: { isPlatformAdmin: true, isActive: true }, select: { id: true } });
  for (const admin of admins) {
    await contentPush
      .send(admin.id, { ...message, icon: `${brand.iconBase}/icon-192.png`, badge: `${brand.iconBase}/icon-192.png` })
      .catch((error) => console.error("[content] push failed", error));
  }
}

export async function notifyContentPublished(post: { id: string; title: string; brand: string }) {
  await pushAdmins(post.brand, {
    title: "Publicado en Instagram",
    body: post.title,
    url: `/admin/content/${post.id}`,
    tag: `content-${post.id}`,
  });
}

export async function notifyContentFailed(post: { id: string; title: string; brand: string }, error: string) {
  await pushAdmins(post.brand, {
    title: "No se pudo publicar en Instagram",
    body: `${post.title} — ${error}`.slice(0, 240),
    url: `/admin/content/${post.id}`,
    tag: `content-${post.id}`,
  });
}

/**
 * The token is about to run out, or already has.
 *
 * A Meta long-lived token lasts about sixty days, so publishing stops dead on
 * a date nobody wrote down — it simply worked last week and does not today.
 * Told once per day at most, by the tag, so a fortnight of warnings is a
 * fortnight of one notification rather than fourteen.
 */
export async function notifyTokenExpiring(brandKey: string, days: number | null) {
  const expired = days === null || days < 0;
  await pushAdmins(brandKey, {
    title: expired ? "Instagram dejó de publicar" : "El token de Instagram está por vencer",
    body: expired
      ? "El token venció o fue revocado. Hasta que lo renueves no se publica nada."
      : `Vence en ${days} días. Renovalo antes de que corte las publicaciones.`,
    url: "/admin/content",
    tag: `ig-token-${new Date().toISOString().slice(0, 10)}`,
  });
}
