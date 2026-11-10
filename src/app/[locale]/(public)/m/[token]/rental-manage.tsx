import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { accentVars } from "@/lib/color";
import { formatMoney } from "@/lib/money";
import { depositMethods } from "@/lib/appointments/methods";
import { onlineSurchargeFor } from "@/lib/appointments/deposit";
import { waLink } from "@/lib/appointments/whatsapp-text";
import { Badge } from "@/components/ui/badge";
import { BrandFooter } from "@/components/brand-footer";
import { CopyButton } from "@/components/app/copy-button";
import type { findRentalByManageToken } from "@/lib/venues/book";
import { CancelRentalForm, PayRentalForm } from "./rental-forms";

type Rental = NonNullable<Awaited<ReturnType<typeof findRentalByManageToken>>>;

/**
 * What a client sees behind their link: when they are playing, what is owed,
 * and the two things they can do about it — pay the seña, or give the court
 * back. No account, because they never made one.
 */
export async function RentalManage({
  rental,
  token,
  locale,
  paid,
}: {
  rental: Rental;
  token: string;
  locale: string;
  /** Back from Mercado Pago; the webhook is what actually confirms. */
  paid?: boolean;
}) {
  const { studio } = rental;
  const t = await getTranslations("manageRental");
  const now = new Date();

  const transfer = await db.payment.findFirst({
    where: { rentalId: rental.id, method: "BANK_TRANSFER", status: "PENDING" },
  });

  // A hold that ran out is over, even before the sweep marks it so.
  const holdOver =
    rental.status === "PENDING_PAYMENT" && rental.holdExpiresAt !== null && rental.holdExpiresAt <= now;
  const status = holdOver ? "EXPIRED" : rental.status;
  const upcoming = (status === "CONFIRMED" || status === "PENDING_PAYMENT") && rental.startsAt > now;

  const cutoff = new Date(rental.startsAt.getTime() - studio.cancellationCutoffHours * 3_600_000);
  const tooLate = now > cutoff;

  const money = (cents: number) => formatMoney(cents, studio.currency, locale);
  const methods = depositMethods(studio);
  const owesDeposit = status === "PENDING_PAYMENT" && rental.depositCents > 0 && rental.depositStatus !== "PAID";
  const mpSurcharge = methods.mp ? onlineSurchargeFor(rental.depositCents, studio) : 0;

  const when = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: studio.timezone,
  }).format(rental.startsAt);

  const tone =
    status === "CONFIRMED" ? "positive" : status === "PENDING_PAYMENT" ? "caution" : undefined;

  const contact = waLink(
    studio.whatsappNumber,
    t("hello", { studio: studio.name, when, space: rental.spaceName }),
  );

  return (
    <div className="accent-scope flex min-h-dvh flex-col" style={accentVars(studio.accentColor)}>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-16 pt-8 sm:px-5">
        <header className="mb-6 text-center">
          <h1 className="text-[28px] leading-tight">{studio.name}</h1>
          <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
        </header>

        <section className="rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-soft)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-xl text-ink first-letter:uppercase">{when}</p>
              <p className="mt-1 text-sm text-ink-soft">
                {rental.spaceName}
                {rental.space.kind ? ` · ${rental.space.kind}` : ""}
              </p>
            </div>
            <Badge tone={tone}>{t(`status.${status}`)}</Badge>
          </div>

          <dl className="mt-4 space-y-1 border-t border-line pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">{t("total")}</dt>
              <dd className="tabular-nums text-ink">{money(rental.priceCents)}</dd>
            </div>
            {rental.depositCents > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted">{t("deposit")}</dt>
                <dd className="tabular-nums text-ink">
                  {money(rental.depositCents)}
                  {rental.depositStatus === "PAID" ? ` · ${t("depositPaid")}` : ""}
                </dd>
              </div>
            )}
          </dl>
        </section>

        {paid && owesDeposit && (
          // Mercado Pago sends them back before the webhook always lands.
          <p className="mt-4 rounded-[var(--radius-md)] bg-sunken px-4 py-3 text-sm text-ink-soft">
            {t("checkingPayment")}
          </p>
        )}

        {status === "EXPIRED" && (
          <p className="mt-4 rounded-[var(--radius-md)] bg-caution-soft px-4 py-3 text-sm text-caution">
            {t("expired")}
          </p>
        )}

        {owesDeposit && (
          <section className="mt-4 rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-soft)]">
            <h2 className="text-base font-medium text-ink">{t("payTitle")}</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {t("payBody", { amount: money(rental.depositCents) })}
            </p>

            {transfer?.shortCode ? (
              /*
                The code is how a club matches a screenshot to a court without
                asking who sent it, so it is shown large and copyable rather
                than buried in the confirmation email.
              */
              <div className="mt-4 rounded-[var(--radius-md)] bg-sunken p-4 text-center">
                <p className="text-xs uppercase tracking-widest text-muted">{t("yourCode")}</p>
                <p className="mt-1 font-display text-2xl tracking-widest text-ink">
                  {transfer.shortCode}
                </p>
                <div className="mt-2 flex justify-center">
                  <CopyButton value={transfer.shortCode} label={t("copyCode")} copiedLabel={t("copiedCode")} />
                </div>
                {contact && (
                  <a
                    href={contact}
                    className="mt-3 inline-block text-sm font-medium text-accent underline-offset-4 hover:underline"
                  >
                    {t("sendReceipt")}
                  </a>
                )}
              </div>
            ) : (
              <PayRentalForm
                token={token}
                methods={methods}
                surchargeLabel={mpSurcharge ? money(rental.depositCents + mpSurcharge) : null}
                copy={{
                  payOnline: t("payOnline"),
                  payTransfer: t("payTransfer"),
                  emailLabel: t("emailLabel"),
                  generic: t("generic"),
                }}
              />
            )}
          </section>
        )}

        {upcoming && (
          <section className="mt-4">
            <CancelRentalForm
              token={token}
              disabled={tooLate}
              copy={{
                cancel: t("cancel"),
                tooLate: t("tooLate", { hours: studio.cancellationCutoffHours }),
                confirm: t("confirmCancel"),
                generic: t("generic"),
              }}
            />
          </section>
        )}

        {contact && (
          <p className="mt-6 text-center">
            <a href={contact} className="text-sm font-medium text-accent underline-offset-4 hover:underline">
              {t("askOnWhatsapp")}
            </a>
          </p>
        )}
      </main>
      <BrandFooter />
    </div>
  );
}
