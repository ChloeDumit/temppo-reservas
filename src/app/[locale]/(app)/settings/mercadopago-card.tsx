import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { disconnectMercadoPagoAction } from "./actions";

/**
 * Where an appointment studio links its own Mercado Pago, so online deposits
 * reach it directly. `outcome` is what the OAuth callback reported back.
 */
export async function MercadoPagoCard({ studioId, outcome }: { studioId: string; outcome?: string }) {
  const t = await getTranslations("settings");
  const account = await db.mercadoPagoAccount.findUnique({
    where: { studioId },
    select: { nickname: true, email: true },
  });

  return (
    <Card id="mercadopago">
      <CardHeader title={t("mpTitle")} />
      <CardBody className="space-y-3">
        {outcome === "connected" && account && <p className="text-sm text-positive">{t("mpConnectedNow")}</p>}
        {outcome === "error" && <p className="text-sm text-critical">{t("mpError")}</p>}
        {account ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="positive">{t("mpConnected")}</Badge>
              <span className="text-sm text-ink">{account.nickname ?? account.email ?? ""}</span>
            </div>
            <p className="text-xs text-muted">{t("mpConnectedHint")}</p>
            <form action={disconnectMercadoPagoAction}>
              <Button type="submit" variant="ghost" size="sm">
                {t("mpDisconnect")}
              </Button>
            </form>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-soft">{t("mpPitch")}</p>
            <a href="/api/mercadopago/connect" className={buttonClass("primary", "md")}>
              {t("mpConnect")}
            </a>
            <p className="text-xs text-muted">{t("mpFallback")}</p>
          </>
        )}
      </CardBody>
    </Card>
  );
}
