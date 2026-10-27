import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/guards";
import { signPayload } from "@/lib/crypto/secret-box";
import { authorizationUrl, isMercadoPagoOAuthConfigured } from "@/lib/payments/mercadopago-oauth";
import { appUrlFor } from "@/lib/brand/url";
import { localePath } from "@/i18n/routing";

export const dynamic = "force-dynamic";

/**
 * Sends the studio's owner to Mercado Pago to authorise us. The state names
 * the studio and who started it, signed and good for 15 minutes, so the
 * callback — which may land on another brand's host, without her session —
 * knows where the account belongs.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !user.studioId || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isMercadoPagoOAuthConfigured()) {
    const back = `${appUrlFor(user.studio)}${localePath(user.studio.locale, "/hours")}?mp=unavailable`;
    return NextResponse.redirect(back);
  }

  const state = signPayload({ sid: user.studioId, uid: user.id }, 15 * 60);
  return NextResponse.redirect(authorizationUrl(state));
}
