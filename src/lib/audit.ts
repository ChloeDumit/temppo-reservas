import "server-only";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getSupportSession } from "@/lib/auth/session";

type AuditInput = {
  studioId: string;
  actorId?: string | null;
  actorLabel?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Append-only trail of who did what. Never throws — an audit failure must not
 * roll back the action the user actually asked for.
 */
export async function recordAudit(input: AuditInput) {
  try {
    let ipAddress: string | null = null;
    try {
      const h = await headers();
      ipAddress = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    } catch {
      // Outside a request scope (scripts, jobs) — fine.
    }

    /*
      On a support visit every action runs as the studio's owner, so the code
      that calls this names her. The trail should name who really did it: the
      platform admin, with the owner kept alongside.
    */
    let actorId = input.actorId ?? null;
    let actorLabel = input.actorLabel ?? null;
    let metadata = input.metadata;
    try {
      const support = await getSupportSession();
      if (support && actorId === support.userId) {
        actorId = support.supportById;
        actorLabel = `${support.supportBy.name} (soporte)`;
        metadata = { ...metadata, onBehalfOf: support.user.name };
      }
    } catch {
      // Outside a request scope — no visit to attribute.
    }

    await db.auditLog.create({
      data: {
        studioId: input.studioId,
        actorId,
        actorLabel,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: (metadata ?? undefined) as never,
        ipAddress,
      },
    });
  } catch (error) {
    console.error("[audit] failed to record", input.action, error);
  }
}
