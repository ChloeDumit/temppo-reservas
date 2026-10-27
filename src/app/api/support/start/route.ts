import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { createSupportEntry, supportTargetFor } from "@/lib/auth/support";
import { recordAudit } from "@/lib/audit";
import { appUrlFor } from "@/lib/brand/url";

/**
 * The console's "Entrar como soporte". Mints the one-use entry and sends the
 * browser to the studio's own host, where /api/support/enter opens the visit.
 *
 * POST only, from the console's form: the session cookie is SameSite=Lax, so a
 * form on another site posting here arrives signed out and gets nowhere.
 */
export async function POST(request: NextRequest) {
  const admin = await getCurrentUser();
  if (!admin?.isPlatformAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const form = await request.formData();
  const studio = await db.studio.findUnique({ where: { id: String(form.get("studioId") ?? "") } });
  const target = studio ? await supportTargetFor(studio.id) : null;
  if (!studio || !target) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const token = await createSupportEntry(target.id, admin.id);
  await recordAudit({
    studioId: studio.id,
    actorId: admin.id,
    actorLabel: `${admin.name} (soporte)`,
    action: "platform.support_enter",
    entityType: "User",
    entityId: target.id,
    metadata: { onBehalfOf: target.name },
  });

  // 303 so the browser follows with a GET.
  return NextResponse.redirect(`${appUrlFor(studio)}/api/support/enter?token=${token}`, 303);
}
