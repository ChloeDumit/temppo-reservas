import "server-only";
import { db } from "@/lib/db";
import { brandByKey } from "@/lib/brand/registry";
import { appUrlFor } from "@/lib/brand/url";
import { emailTransport } from "@/lib/notifications/email";
import { contentPush } from "./notify";

/*
  Reminders for the posts that go up by hand — a reel that wants a voice-over
  or an audio from Instagram's library. Two of them: the day before, with time
  to record, and a couple of hours before. Each goes to every platform admin
  by push and by email, with the post's notes (what to edit, the voice-over
  script) so nothing has to be looked up.

  `reminderStage` keeps what was sent; moving the post's date sets it back to 0.
*/

const DAY_BEFORE_MS = 24 * 3_600_000;
const SOON_MS = 2 * 3_600_000;
const TZ = "America/Montevideo";

const whenText = (at: Date) =>
  at.toLocaleString("es-UY", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export async function remindManualContent(now = new Date()) {
  const due = await db.contentPost.findMany({
    where: {
      channel: "MANUAL",
      status: { in: ["READY", "SCHEDULED"] },
      reminderStage: { lt: 2 },
      scheduledAt: { gt: now, lte: new Date(now.getTime() + DAY_BEFORE_MS) },
    },
    orderBy: { scheduledAt: "asc" },
  });
  if (!due.length) return 0;

  const admins = await db.user.findMany({
    where: { isPlatformAdmin: true, isActive: true },
    select: { id: true, email: true, studioId: true },
  });

  let sent = 0;
  for (const post of due) {
    const at = post.scheduledAt!;
    const stage = at.getTime() - now.getTime() <= SOON_MS ? 2 : 1;
    if (stage <= post.reminderStage) continue;
    // The claim: a second sweep at the same time finds it taken.
    const claimed = await db.contentPost.updateMany({
      where: { id: post.id, reminderStage: post.reminderStage, scheduledAt: at },
      data: { reminderStage: stage },
    });
    if (!claimed.count) continue;

    const brand = brandByKey(post.brand);
    const link = `${appUrlFor({ brand: post.brand })}/admin/content/${post.id}`;
    const lead = stage === 1 ? "Mañana" : "En un rato";
    const notes = post.notes?.trim() || "Sin notas: el archivo y el caption están en la consola.";
    const body = [
      `${lead}, ${whenText(at)}, toca publicar a mano «${post.title}».`,
      "",
      "Qué hacer:",
      notes,
      "",
      `El archivo y el caption para copiar están en la consola: ${link}`,
      "Cuando la subas, tocá «La publiqué a mano» para que quede registrada.",
    ].join("\n");

    for (const admin of admins) {
      await contentPush
        .send(admin.id, {
          title: `${lead} subís a mano: ${post.title}`,
          body: notes.split("\n")[0].slice(0, 200),
          url: `/admin/content/${post.id}`,
          tag: `content-reminder-${post.id}`,
          icon: `${brand.iconBase}/icon-192.png`,
          badge: `${brand.iconBase}/icon-192.png`,
        })
        .catch((error) => console.error("[content] reminder push failed", error));
      if (admin.email) {
        const result = await emailTransport.send({
          studioId: admin.studioId,
          to: admin.email,
          subject: `${lead}: «${post.title}» (a mano)`,
          body,
          template: "content-reminder",
          relatedType: "ContentPost",
          relatedId: post.id,
        });
        await db.notificationLog
          .create({
            data: {
              studioId: admin.studioId,
              channel: "EMAIL",
              template: "content-reminder",
              recipient: admin.email,
              status: result.ok ? "SENT" : "FAILED",
              error: result.error ?? null,
              sentAt: result.ok ? new Date() : null,
              relatedType: "ContentPost",
              relatedId: post.id,
            },
          })
          .catch((error) => console.error("[content] reminder log failed", error));
      }
    }
    sent++;
  }
  return sent;
}
