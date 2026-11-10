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
import { Input } from "@/components/ui/field";
import { checkCoupon, couponProblemText, discountFor } from "@/lib/coupons";

export default async function BuyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ cupon?: string }>;
}) {
  const { locale } = await params;
  const { cupon } = await searchParams;
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

  // A discount code typed above: what it takes off each pack it applies to.
  const typed = cupon?.trim().slice(0, 40) ?? "";
  const checks = typed
    ? await Promise.all(packs.map(async (pack) => [pack.id, await checkCoupon(studio.id, typed, { packId: pack.id })] as const))
    : [];
  const couponFor = new Map(checks.flatMap(([id, r]) => ("coupon" in r ? [[id, r.coupon] as const] : [])));
  const couponProblem =
    typed && couponFor.size === 0 && checks[0] && "problem" in checks[0][1]
      ? couponProblemText(checks.some(([, r]) => "problem" in r && r.problem === "notForThis") ? "notForThis" : checks[0][1].problem, locale === "en")
      : null;

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

      {packs.length > 0 && (
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 space-y-1.5">
            <span className="block text-sm font-medium text-ink-soft">{t("couponLabel")}</span>
            <Input name="cupon" defaultValue={typed} autoCapitalize="characters" autoComplete="off" className="uppercase" />
          </label>
          <Button type="submit" variant="secondary">
            {t("couponApply")}
          </Button>
          {couponProblem && <p className="w-full text-sm text-critical">{couponProblem}</p>}
          {couponFor.size > 0 && (
            <p className="w-full text-sm text-positive">
              🎟️ {t("couponApplied", { code: [...couponFor.values()][0].code, percent: [...couponFor.values()][0].percentOff })}
            </p>
          )}
        </form>
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
                  <div className="shrink-0 text-right">
                    {couponFor.has(pack.id) && (
                      <p className="text-xs text-muted line-through">{formatMoney(pack.priceCents, studio.currency, locale)}</p>
                    )}
                    <Badge tone="accent">
                      {formatMoney(
                        pack.priceCents - (couponFor.has(pack.id) ? discountFor(pack.priceCents, couponFor.get(pack.id)!.percentOff) : 0),
                        studio.currency,
                        locale,
                      )}
                    </Badge>
                  </div>
                </div>

                {onlineEnabled && (
                  <form action={startCheckoutAction}>
                    <input type="hidden" name="packId" value={pack.id} />
                    {couponFor.has(pack.id) && <input type="hidden" name="coupon" value={couponFor.get(pack.id)!.code} />}
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
                    couponCode={couponFor.get(pack.id)?.code ?? null}
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
