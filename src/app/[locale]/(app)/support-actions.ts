"use server";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { endSupportSession, getSupportSession } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { appUrlFor } from "@/lib/brand/url";
import { localePath } from "@/i18n/routing";

/**
 * Ends a support visit and puts the admin back on the studio's page in the
 * console, on their own host, where their own session is still waiting.
 */
export async function exitSupportAction() {
  const locale = await getLocale();
  const support = await getSupportSession();
  await endSupportSession();
  if (!support) redirect(localePath(locale, "/login"));

  await recordAudit({
    studioId: support.user.studioId,
    actorId: support.supportById,
    actorLabel: `${support.supportBy.name} (soporte)`,
    action: "platform.support_exit",
    entityType: "User",
    entityId: support.userId,
    metadata: { onBehalfOf: support.user.name },
  });

  redirect(`${appUrlFor(support.supportBy.studio)}${localePath(locale, `/admin/studios/${support.user.studioId}`)}`);
}
