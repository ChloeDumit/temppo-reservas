import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ADMIN_ROLES } from "@/lib/auth/guards";
import { verifyPayload } from "@/lib/crypto/secret-box";
import { connectMercadoPago } from "@/lib/payments/mercadopago-oauth";
import { recordAudit } from "@/lib/audit";
import { appUrlFor } from "@/lib/brand/url";
import { localePath } from "@/i18n/routing";

export const dynamic = "force-dynamic";

/**
 * Where Mercado Pago sends the owner back. Trusts only the signed state for
 * which studio this is, checks she still runs it, keeps the account, and
 * returns her to Ajustes on her own domain.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = verifyPayload<{ sid: string; uid: string }>(params.get("state"));
  if (!state) return NextResponse.json({ error: "invalid state" }, { status: 400 });

  const user = await db.user.findFirst({
    where: { id: state.uid, studioId: state.sid, isActive: true, role: { in: ADMIN_ROLES } },
    include: { studio: true },
  });
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const back = (outcome: string) =>
    NextResponse.redirect(`${appUrlFor(user.studio)}${localePath(user.studio.locale, "/settings")}?mp=${outcome}#mercadopago`);

  const code = params.get("code");
  // She cancelled at Mercado Pago, or it refused.
  if (!code) return back("cancelled");

  try {
    await connectMercadoPago(user.studioId, code);
  } catch (error) {
    console.error("[mercadopago/callback]", error);
    return back("error");
  }

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "studio.mercadopago_connected",
    entityType: "Studio",
    entityId: user.studioId,
  });
  return back("connected");
}
