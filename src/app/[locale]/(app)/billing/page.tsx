import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireRole } from "@/lib/auth/guards";
import {
  billingWarning,
  chargesFor,
  isSubscriptionBillingConfigured,
  PAID_PLANS,
  PLAN_PRICE_CENTS,
  PLATFORM_CURRENCY,
  subscriptionFor,
} from "@/lib/billing";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { CancelSubscriptionForm, SubscribeButton } from "./billing-forms";
import type { SubscriptionStatus } from "@/generated/prisma/enums";

const STATUS_TONE: Record<SubscriptionStatus, "neutral" | "positive" | "caution" | "critical"> = {
  PENDING: "caution",
  ACTIVE: "positive",
  PAST_DUE: "critical",
  PAUSED: "caution",
  CANCELLED: "neutral",
};

export default async function BillingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // The studio's bill is the owner's business — an ADMIN runs the studio, not
  // the company behind it.
  const user = await requireRole(["OWNER"]);
  const studio = user.studio;
  const t = await getTranslations("billing");

  const [subscription, charges] = await Promise.all([
    subscriptionFor(studio.id),
    chargesFor(studio.id),
  ]);

  const warning = billingWarning(studio, subscription);
  const autoDebitAvailable = isSubscriptionBillingConfigured();
  const money = (cents: number) => formatMoney(cents, PLATFORM_CURRENCY, locale);
  const day = (date: Date) => formatDate(date, studio.timezone, locale);

  return (
    <>
      <PageHeader title={t("title")} />

      <div className="space-y-4">
        {warning && (
          <p
            className={`rounded-[var(--radius-lg)] px-4 py-3 text-sm ${
              warning === "pastDue"
                ? "bg-critical-soft text-critical"
                : "bg-caution-soft text-caution"
            }`}
          >
            {t(`warning.${warning}`)}
          </p>
        )}

        <Card>
          <CardHeader
            title={t("current")}
            action={
              subscription ? (
                <Badge tone={STATUS_TONE[subscription.status]}>
                  {t(`status.${subscription.status}`)}
                </Badge>
              ) : (
                <Badge tone="neutral">{t("status.NONE")}</Badge>
              )
            }
          />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-lg font-semibold text-ink">
                {studio.plan === "TRIAL" ? t("planTrial") : t(`plan.${studio.plan}`)}
              </span>
              {subscription && (
                <span className="text-sm text-muted">
                  {t("perMonth", { amount: money(subscription.amountCents) })}
                </span>
              )}
            </div>

            {studio.plan === "TRIAL" && studio.trialEndsAt && (
              <p className="text-sm text-muted">
                {t("trialEnds", { date: day(studio.trialEndsAt) })}
              </p>
            )}

            {subscription?.currentPeriodEnd && subscription.status === "ACTIVE" && (
              <p className="text-sm text-muted">
                {t("nextCharge", { date: day(subscription.currentPeriodEnd) })}
              </p>
            )}

            {subscription?.lastPaymentAt && (
              <p className="text-xs text-muted">
                {t("lastPayment", { date: day(subscription.lastPaymentAt) })}
              </p>
            )}

            {subscription && subscription.status !== "CANCELLED" && subscription.providerRef && (
              <CancelSubscriptionForm />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={t("choosePlan")}
            description={autoDebitAvailable ? t("choosePlanHint") : undefined}
          />
          <CardBody className="space-y-3">
            {!autoDebitAvailable && (
              <p className="rounded-[var(--radius-md)] bg-sunken px-3 py-2.5 text-sm text-muted">
                {t("manualOnly")}
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              {PAID_PLANS.map((plan) => {
                const isCurrent = studio.plan === plan && subscription?.status === "ACTIVE";
                return (
                  <div
                    key={plan}
                    className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-line p-4"
                  >
                    <p className="text-sm font-semibold text-ink">{t(`plan.${plan}`)}</p>
                    <p className="text-lg font-semibold text-ink">
                      {money(PLAN_PRICE_CENTS[plan])}
                    </p>
                    <p className="flex-1 text-xs text-muted">{t(`planBlurb.${plan}`)}</p>
                    {isCurrent ? (
                      <Badge tone="accent">{t("currentPlan")}</Badge>
                    ) : (
                      autoDebitAvailable && (
                        <SubscribeButton
                          plan={plan}
                          label={subscription?.status === "ACTIVE" ? t("switch") : t("subscribe")}
                          variant={studio.plan === "TRIAL" ? "primary" : "secondary"}
                        />
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>

        {charges.length > 0 && (
          <Card>
            <CardHeader title={t("history")} />
            <CardBody className="p-0">
              <ul className="divide-y divide-line">
                {charges.map((charge) => (
                  <li
                    key={charge.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-ink">
                        {money(charge.amountCents)}
                        {charge.method === "BANK_TRANSFER" && (
                          <span className="ml-2 text-xs text-muted">{t("byTransfer")}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted">{day(charge.paidAt ?? charge.createdAt)}</p>
                    </div>
                    <Badge tone={charge.status === "APPROVED" ? "positive" : "caution"}>
                      {t(`chargeStatus.${charge.status}`)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
