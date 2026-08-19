import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireStudentProfile } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { isOnlinePaymentEnabled } from "@/lib/payments";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { SheetForm } from "@/components/app/sheet-form";
import { TransferForm } from "./transfer-form";
import { startCheckoutAction } from "./actions";

export default async function BuyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { user, profile } = await requireStudentProfile();

  const studio = user.studio;
  const t = await getTranslations("buy");
  const tp = await getTranslations("packs");

  const [packs, pendingCount] = await Promise.all([
    db.classPack.findMany({
      where: { studioId: studio.id, isActive: true },
      orderBy: { priceCents: "asc" },
    }),
    db.payment.count({
      where: { studentId: profile.id, status: "PENDING" },
    }),
  ]);

  const onlineEnabled = isOnlinePaymentEnabled();

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      {pendingCount > 0 && (
        <p className="mb-4 rounded-lg bg-caution-soft px-4 py-2.5 text-sm text-caution">
          {t("pendingNotice")}
        </p>
      )}

      {!onlineEnabled && (
        <p className="mb-4 rounded-lg bg-sunken px-4 py-2.5 text-sm text-ink-soft">
          {t("onlineUnavailable")}
        </p>
      )}

      {packs.length === 0 ? (
        <Card>
          <EmptyState message={t("empty")} />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {packs.map((pack) => (
            <Card key={pack.id}>
              <CardBody className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{pack.name}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      {pack.isUnlimited
                        ? tp("unlimited")
                        : tp("creditsLabel", { count: pack.credits })}{" "}
                      · {tp("validityLabel", { days: pack.validityDays })}
                    </p>
                    {pack.description && (
                      <p className="mt-1 text-sm text-ink-soft">{pack.description}</p>
                    )}
                  </div>
                  <Badge tone="accent">
                    {formatMoney(pack.priceCents, studio.currency, locale)}
                  </Badge>
                </div>

                {onlineEnabled && (
                  <form action={startCheckoutAction}>
                    <input type="hidden" name="packId" value={pack.id} />
                    <Button type="submit" className="w-full">
                      {t("payOnline")}
                    </Button>
                  </form>
                )}

                <SheetForm
                  label={t("payTransfer")}
                  title={t("payTransfer")}
                  variant="secondary"
                  icon="wallet"
                  className="w-full"
                >
                  <p className="mb-3 text-xs text-muted">{t("transferHint")}</p>
                  <TransferForm
                    packId={pack.id}
                    studioWhatsapp={studio.whatsappNumber}
                    studentName={user.name}
                    currency={studio.currency}
                    locale={locale}
                  />
                </SheetForm>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
