import "server-only";
import { headers } from "next/headers";
import { db } from "@/lib/db";

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

    await db.auditLog.create({
      data: {
        studioId: input.studioId,
        actorId: input.actorId ?? null,
        actorLabel: input.actorLabel ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: (input.metadata ?? undefined) as never,
        ipAddress,
      },
    });
  } catch (error) {
    console.error("[audit] failed to record", input.action, error);
  }
}
