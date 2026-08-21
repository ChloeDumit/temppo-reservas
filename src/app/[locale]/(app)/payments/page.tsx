import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { currentLocationId } from "@/lib/locations";
import { formatDate, startOfMonthInZone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/ui/stat";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { SheetForm } from "@/components/app/sheet-form";
import { ExpenseForm, RecordPaymentForm, RejectForm } from "./payment-forms";
import { approvePaymentAction, rejectPaymentAction } from "./actions";

export default async function PaymentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireAdmin();
  const studio = user.studio;
  const t = await getTranslations("payments");
  const td = await getTranslations("dashboard");

  const monthStart = startOfMonthInZone(new Date(), studio.timezone);

  const locationId = await currentLocationId(studio.id);
  // A payment buys a pack, not a class, so the only sucursal it can be tied
  // to is the student's own.
  const atLocation = locationId ? { locations: { some: { id: locationId } } } : {};

  const [pending, history, monthTx, students, packs] = await Promise.all([
    db.payment.findMany({
      where: { studioId: studio.id, status: "PENDING", ...(locationId ? { student: atLocation } : {}) },
      include: { student: { include: { user: true } }, studentPack: { include: { pack: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.payment.findMany({
      where: {
        studioId: studio.id,
        status: { not: "PENDING" },
        ...(locationId ? { student: atLocation } : {}),
      },
      include: { student: { include: { user: true } } },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    db.transaction.groupBy({
      by: ["type"],
      where: { studioId: studio.id, occurredAt: { gte: monthStart } },
      _sum: { amountCents: true },
    }),
    db.studentProfile.findMany({
      where: { user: { studioId: studio.id, isActive: true }, ...atLocation },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    }),
    db.classPack.findMany({
      where: { studioId: studio.id, isActive: true },
      orderBy: { priceCents: "asc" },
    }),
  ]);

  const income = monthTx.find((r) => r.type === "INCOME")?._sum.amountCents ?? 0;
  const expenses = monthTx.find((r) => r.type === "EXPENSE")?._sum.amountCents ?? 0;
  const money = (cents: number) => formatMoney(cents, studio.currency, locale);

  return (
    <>
      <PageHeader title={t("title")} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={td("income")} value={money(income)} tone="positive" />
        <Stat label={td("expenses")} value={money(expenses)} />
        <Stat
          label={t("balance")}
          value={money(income - expenses)}
          tone={income - expenses >= 0 ? "positive" : "critical"}
        />
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <SheetForm label={t("registerPayment")} title={t("registerPayment")}>
          <RecordPaymentForm
            currency={studio.currency}
            students={students.map((s) => ({ id: s.id, name: s.user.name }))}
            packs={packs.map((p) => ({ id: p.id, name: p.name, priceCents: p.priceCents }))}
          />
        </SheetForm>
        <SheetForm
          label={t("addExpense")}
          title={t("addExpense")}
          variant="secondary"
          icon="wallet"
        >
          <ExpenseForm currency={studio.currency} />
        </SheetForm>
      </div>

      <Card className="mb-5">
        <CardHeader title={t("pending")} />
        {pending.length === 0 ? (
          <EmptyState message={t("noPending")} />
        ) : (
          <ul className="divide-y divide-line">
            {pending.map((payment) => (
              <li key={payment.id} className="space-y-3 px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/students/${payment.studentId}`}
                      className="text-sm font-medium text-ink hover:text-accent"
                    >
                      {payment.student.user.name}
                    </Link>
                    {/* The code the student quotes in their WhatsApp message. */}
                    {payment.shortCode && (
                      <p className="mt-1 font-display text-lg font-bold tracking-wider text-accent">
                        {payment.shortCode}
                      </p>
                    )}
                    <p className="text-xs text-muted">
                      {t(`method${payment.method}`)} ·{" "}
                      {formatDate(payment.createdAt, studio.timezone, locale)}
                      {payment.reference ? ` · ${payment.reference}` : ""}
                    </p>
                    {payment.studentPack && (
                      <p className="text-xs text-muted">{payment.studentPack.pack.name}</p>
                    )}
                  </div>
                  <p className="shrink-0 font-display text-lg font-semibold tabular-nums">
                    {money(payment.amountCents)}
                  </p>
                </div>

                {payment.proofUrl && (
                  <a
                    href={payment.proofUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-sm text-accent underline underline-offset-4"
                  >
                    {t("viewProof")}
                  </a>
                )}

                <div className="flex flex-wrap items-end gap-3">
                  <form action={approvePaymentAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="paymentId" value={payment.id} />
                    {!payment.studentPackId && (
                      <select
                        name="packId"
                        required
                        defaultValue=""
                        className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
                        aria-label={t("pack")}
                      >
                        <option value="" disabled>
                          {t("pack")}
                        </option>
                        {packs.map((pack) => (
                          <option key={pack.id} value={pack.id}>
                            {pack.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <Button type="submit" size="sm">
                      {t("approve")}
                    </Button>
                  </form>

                  <RejectForm paymentId={payment.id} action={rejectPaymentAction} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title={t("history")} />
        {history.length === 0 ? (
          <EmptyState message={t("empty")} />
        ) : (
          <>
            {/* Phones get rows, not a table that scrolls sideways. */}
            <ul className="divide-y divide-line lg:hidden">
              {history.map((payment) => (
                <li key={payment.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/students/${payment.studentId}`}
                      className="block truncate text-[15px] font-medium text-ink"
                    >
                      {payment.student.user.name}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {t(`method${payment.method}`)} ·{" "}
                      {formatDate(payment.createdAt, studio.timezone, locale)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[15px] font-semibold tabular-nums text-ink">
                      {money(payment.amountCents)}
                    </p>
                    <Badge
                      tone={
                        payment.status === "APPROVED"
                          ? "positive"
                          : payment.status === "REJECTED"
                            ? "critical"
                            : "neutral"
                      }
                    >
                      {t(`status${payment.status}`)}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-2 font-medium">{t("student")}</th>
                    <th className="px-4 py-2 font-medium">{t("amount")}</th>
                    <th className="px-4 py-2 font-medium">{t("method")}</th>
                    <th className="px-4 py-2 font-medium">{t("date")}</th>
                    <th className="px-4 py-2 font-medium">{t("status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {history.map((payment) => (
                    <tr key={payment.id}>
                      <td className="px-5 py-2.5">
                        <Link href={`/students/${payment.studentId}`} className="hover:text-accent">
                          {payment.student.user.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">{money(payment.amountCents)}</td>
                      <td className="px-4 py-2.5 text-muted">{t(`method${payment.method}`)}</td>
                      <td className="px-4 py-2.5 text-muted">
                        {formatDate(payment.createdAt, studio.timezone, locale)}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge
                          tone={
                            payment.status === "APPROVED"
                              ? "positive"
                              : payment.status === "REJECTED"
                                ? "critical"
                                : "neutral"
                          }
                        >
                          {t(`status${payment.status}`)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
