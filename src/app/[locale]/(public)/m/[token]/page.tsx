import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { db } from "@/lib/db";
import { accentVars } from "@/lib/color";
import { dateKeyInZone, formatTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { depositMethods } from "@/lib/appointments/methods";
import { findByManageToken } from "@/lib/appointments/book";
import { whenText, waLink } from "@/lib/appointments/whatsapp-text";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { BrandFooter } from "@/components/brand-footer";
import { CopyButton } from "@/components/app/copy-button";
import { manageUrlFor } from "@/lib/appointments/notify";
import { CancelForm, PayForm, RescheduleForm } from "./manage-forms";

// The token is a secret; keep it out of search engines and referrers.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; token: string }>;
  searchParams: Promise<{ paid?: string; new?: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const query = await searchParams;

  const appt = await findByManageToken(token);
  if (!appt) notFound();
  const { studio } = appt;
  const t = await getTranslations("manage");
  const now = new Date();

  const transfer = await db.payment.findFirst({
    where: { appointmentId: appt.id, method: "BANK_TRANSFER", status: "PENDING" },
  });

  // A hold that ran out is over, even before the sweep marks it so.
  const holdOver = appt.status === "PENDING_PAYMENT" && appt.holdExpiresAt !== null && appt.holdExpiresAt <= now;
  const status = holdOver ? "EXPIRED" : appt.status;
  const live = status === "CONFIRMED" || status === "PENDING_PAYMENT";
  const upcoming = live && appt.startsAt > now;
  const cutoff = new Date(appt.startsAt.getTime() - studio.cancellationCutoffHours * 3_600_000);
  const late = now > cutoff;
  const money = (cents: number) => formatMoney(cents, studio.currency, locale);
  const total = appt.priceCents;

  const statusBadge = {
    PENDING_PAYMENT: <Badge tone="caution">{t("statusPending")}</Badge>,
    CONFIRMED: <Badge tone="positive">{t("statusConfirmed")}</Badge>,
    CANCELLED: <Badge>{t("statusCancelled")}</Badge>,
    LATE_CANCELLED: <Badge>{t("statusCancelled")}</Badge>,
    COMPLETED: <Badge>{t("statusDone")}</Badge>,
    NO_SHOW: <Badge>{t("statusNoShow")}</Badge>,
    EXPIRED: <Badge tone="critical">{t("statusExpired")}</Badge>,
  }[status];

  const receiptLink =
    transfer &&
    waLink(
      studio.whatsappNumber,
      t("receiptMessage", {
        code: transfer.shortCode ?? "",
        name: appt.client.user.name,
        amount: money(transfer.amountCents),
        service: appt.serviceName,
        when: whenText(appt.startsAt, studio),
      }),
    );
  const contact = waLink(studio.whatsappNumber, t("hello", { studio: studio.name }));
  const manageUrl = manageUrlFor(studio, token);
  const selfLink = waLink(appt.client.user.phone, t("selfMessage", { service: appt.serviceName, url: manageUrl }));
  const card = "rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-[var(--shadow-soft)]";

  return (
    <div className="accent-scope flex min-h-dvh flex-col" style={accentVars(studio.accentColor)}>
      <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 pb-16 pt-8">
        <header className="text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-accent">{studio.name}</p>
          <h1 className="mt-1 text-[26px] leading-tight">
            {(query.new || query.paid === "1") && status === "CONFIRMED" ? t("bookedTitle") : t("title")}
          </h1>
        </header>

        {query.paid === "1" && status === "PENDING_PAYMENT" && (
          <p className="rounded-[var(--radius-md)] bg-positive-soft px-4 py-3 text-sm text-positive">{t("paymentProcessing")}</p>
        )}
        {query.paid === "0" && status === "PENDING_PAYMENT" && (
          <p className="rounded-[var(--radius-md)] bg-critical-soft px-4 py-3 text-sm text-critical">{t("paymentFailed")}</p>
        )}

        <section className={card}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-ink">{appt.serviceName}</p>
              {appt.addOns.length > 0 && <p className="text-sm text-muted">+ {appt.addOns.map((a) => a.name).join(", ")}</p>}
            </div>
            {statusBadge}
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t("when")}</dt>
              <dd className="text-right font-medium text-ink">{whenText(appt.startsAt, studio)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t("with")}</dt>
              <dd className="font-medium text-ink">{appt.staff.name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t("price")}</dt>
              <dd className="tabular-nums text-ink">{money(total)}</dd>
            </div>
            {appt.depositCents > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{t("deposit")}</dt>
                <dd className="tabular-nums text-ink">
                  {money(appt.depositCents)}{" "}
                  <span className="text-muted">
                    · {t(`deposit${appt.depositStatus}` as "depositPAID")}
                  </span>
                </dd>
              </div>
            )}
          </dl>
        </section>

        {query.new && !appt.client.user.email && live && (
          // Without an email this page is her only way back to the booking.
          <section className={`${card} space-y-3`}>
            <p className="text-sm text-ink">{t("saveLink")}</p>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={manageUrl} label={t("copyLink")} copiedLabel={t("copied")} />
              {selfLink && (
                <ButtonLink href={selfLink} size="sm" variant="secondary">
                  {t("sendToMyWhatsapp")}
                </ButtonLink>
              )}
            </div>
          </section>
        )}

        {status === "PENDING_PAYMENT" && (
          <section className={card}>
            {transfer ? (
              <div className="space-y-3">
                <p className="text-sm text-ink">{t("transferSteps", { amount: money(transfer.amountCents) })}</p>
                {studio.transferInstructions && (
                  <p className="whitespace-pre-line rounded-[var(--radius-md)] border border-line px-3 py-2.5 text-sm text-ink">
                    {studio.transferInstructions}
                  </p>
                )}
                <p className="rounded-[var(--radius-md)] bg-sunken py-3 text-center font-mono text-xl tracking-widest text-ink">
                  {transfer.shortCode}
                </p>
                {receiptLink && (
                  <ButtonLink href={receiptLink} className="w-full">
                    {t("sendReceipt")}
                  </ButtonLink>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-ink">{t("payToConfirm", { amount: money(appt.depositCents) })}</p>
                <PayForm
                  token={token}
                  hasEmail={Boolean(appt.client.user.email)}
                  methods={depositMethods(studio)}
                />
              </div>
            )}
            {appt.holdExpiresAt && (
              <p className="mt-3 text-xs text-muted">
                {t("holdUntil", {
                  time:
                    dateKeyInZone(appt.holdExpiresAt, studio.timezone) === dateKeyInZone(now, studio.timezone)
                      ? formatTime(appt.holdExpiresAt, studio.timezone, locale)
                      : whenText(appt.holdExpiresAt, studio),
                })}
              </p>
            )}
          </section>
        )}

        {upcoming && (
          <section className="space-y-2">
            {!late && appt.serviceId && (
              <RescheduleForm
                token={token}
                slug={studio.slug}
                serviceId={appt.serviceId}
                staffId={appt.staffId}
                addOnIds={appt.addOns.map((a) => a.addOnId).filter((id): id is string => Boolean(id))}
                timeZone={studio.timezone}
                today={dateKeyInZone(now, studio.timezone)}
              />
            )}
            <CancelForm token={token} late={late && appt.depositStatus === "PAID"} />
            <p className="px-1 text-center text-xs text-muted">
              {late
                ? t("pastCutoff")
                : t("cutoffNote", { hours: studio.cancellationCutoffHours })}
            </p>
          </section>
        )}

        {!upcoming && (
          <ButtonLink href={`/b/${studio.slug}`} variant="secondary" className="w-full">
            {t("bookAgain")}
          </ButtonLink>
        )}

        {contact && (
          <p className="text-center text-sm">
            <a href={contact} className="font-medium text-accent underline-offset-4 hover:underline">
              {t("writeToStudio")}
            </a>
          </p>
        )}
      </main>
      <BrandFooter />
    </div>
  );
}
