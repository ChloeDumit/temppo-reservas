import "server-only";
import { db } from "@/lib/db";
import { publishProblem } from "./instagram";

/** Puts a post on the calendar at `at`, after the same checks as the console's «Programar». */
export async function schedulePost(postId: string, at: Date, now = new Date()): Promise<{ ok: true } | { error: string; status: number }> {
  const post = await db.contentPost.findUnique({ where: { id: postId }, include: { media: { orderBy: { position: "asc" } } } });
  if (!post) return { error: "post not found", status: 404 };
  if (post.status === "PUBLISHED" || post.status === "PUBLISHING") return { error: "Ya se publicó o se está publicando", status: 409 };
  if (Number.isNaN(at.getTime()) || at.getTime() < now.getTime() + 5 * 60_000) {
    return { error: "La hora tiene que ser al menos 5 minutos más adelante", status: 400 };
  }
  if (post.channel === "INSTAGRAM") {
    const problem = publishProblem(post);
    if (problem) return { error: problem, status: 400 };
  }
  await db.contentPost.update({
    where: { id: post.id },
    data: {
      scheduledAt: at,
      status: "SCHEDULED",
      error: null,
      igContainerId: null,
      attempts: 0,
      ...(at.getTime() !== post.scheduledAt?.getTime() ? { reminderStage: 0 } : {}),
    },
  });
  return { ok: true };
}
