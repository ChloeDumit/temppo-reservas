import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDateTime, startOfMonthInZone } from "@/lib/dates";
import { attendanceSummary, financialSummary, instructorPayroll } from "@/lib/reports";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { BarChart } from "@/components/ui/bar-chart";
import { Input } from "@/components/ui/field";
import { Button, buttonClass } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/ui/page-header";

const EXPORTS = [
  ["payments", "exportPayments"],
  ["transactions", "exportTransactions"],
  ["bookings", "exportBookings"],
  ["payroll", "exportPayroll"],
  ["students", "exportStudents"],
  ["audit", "exportAudit"],
] as const;

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;

  const user = await requireAdmin();
  const studio = user.studio;
  const t = await getTranslations("reports");
  const tp = await getTranslations("payments");

  const now = new Date();
  const defaultFrom = startOfMonthInZone(now, studio.timezone);

  const isDate = (value?: string) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
  const from = isDate(query.from) ? new Date(`${query.from}T00:00:00Z`) : defaultFrom;
  const to = isDate(query.to)
    ? new Date(new Date(`${query.to}T00:00:00Z`).getTime() + 86_400_000)
    : now;

  const range = { from, to };

  const [finance, attendance, payroll, audit, incomeRows] = await Promise.all([
    financialSummary(studio.id, range),
    attendanceSummary(studio.id, range),
    instructorPayroll(studio.id, range),
    db.auditLog.findMany({
      where: { studioId: studio.id, createdAt: { gte: from, lt: to } },
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    db.transaction.findMany({
      where: { studioId: studio.id, type: "INCOME", occurredAt: { gte: from, lt: to } },
      select: { amountCents: true, occurredAt: true },
      orderBy: { occurredAt: "asc" },
    }),
  ]);

  // Bucket income into calendar weeks for the chart.
  const weekBuckets = new Map<string, number>();
  for (const row of incomeRows) {
    const monday = new Date(row.occurredAt);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    weekBuckets.set(key, (weekBuckets.get(key) ?? 0) + row.amountCents);
  }
  const chartBars = [...weekBuckets.entries()].map(([key, cents]) => ({
    label: new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${key}T12:00:00Z`)),
    value: cents,
  }));

  const money = (cents: number) => formatMoney(cents, studio.currency, locale);
  const payrollTotal = payroll.reduce((sum, row) => sum + row.payCents, 0);

  const fromValue = query.from ?? from.toISOString().slice(0, 10);
  const toValue = query.to ?? now.toISOString().slice(0, 10);
  const exportQuery = `?from=${fromValue}&to=${toValue}`;

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      <Card className="mb-5">
        <CardBody>
          <form className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="from" className="mb-1.5 block text-sm font-medium text-ink-soft">
                {t("from")}
              </label>
              <Input id="from" name="from" type="date" defaultValue={fromValue} />
            </div>
            <div>
              <label htmlFor="to" className="mb-1.5 block text-sm font-medium text-ink-soft">
                {t("to")}
              </label>
              <Input id="to" name="to" type="date" defaultValue={toValue} />
            </div>
            <Button type="submit" variant="secondary">
              {t("apply")}
            </Button>
          </form>
        </CardBody>
      </Card>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={tp("balance")} value={money(finance.net)} tone={finance.net >= 0 ? "positive" : "critical"} />
        <Stat label={t("attended")} value={attendance.attended} />
        <Stat label={t("noShow")} value={attendance.noShow} tone={attendance.noShow > 0 ? "accent" : undefined} />
        <Stat label={t("payrollTotal")} value={money(payrollTotal)} />
      </div>

      <Card className="mb-5">
        <CardHeader title={t("weekly")} />
        <CardBody>
          <BarChart
            bars={chartBars}
            formatValue={(cents) => money(cents)}
            emptyLabel={t("noChartData")}
          />
        </CardBody>
      </Card>

      <Card className="mb-5">
        <CardHeader title={t("payroll")} />
        {payroll.length === 0 ? (
          <EmptyState message={t("payrollEmpty")} />
        ) : (
          <>
            <ul className="divide-y divide-line lg:hidden">
              {payroll.map((row) => (
                <li key={row.instructorId} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-ink">{row.name}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {row.classes} {t("classes").toLowerCase()} · {(row.minutes / 60).toFixed(1)}h
                      · {t(`basis${row.basis}`)}
                    </p>
                  </div>
                  <p className="shrink-0 text-[15px] font-semibold tabular-nums text-ink">
                    {money(row.payCents)}
                  </p>
                </li>
              ))}
              <li className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-medium">{t("payrollTotal")}</span>
                <span className="font-display text-lg font-semibold tabular-nums">
                  {money(payrollTotal)}
                </span>
              </li>
            </ul>

            <div className="hidden lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-2 font-medium">{t("instructor")}</th>
                    <th className="px-4 py-2 font-medium">{t("classes")}</th>
                    <th className="px-4 py-2 font-medium">{t("hours")}</th>
                    <th className="px-4 py-2 font-medium">{t("attendees")}</th>
                    <th className="px-4 py-2 font-medium">{t("basis")}</th>
                    <th className="px-4 py-2 text-right font-medium">{t("pay")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {payroll.map((row) => (
                    <tr key={row.instructorId}>
                      <td className="px-5 py-2.5 font-medium">{row.name}</td>
                      <td className="px-4 py-2.5 tabular-nums">{row.classes}</td>
                      <td className="px-4 py-2.5 tabular-nums">{(row.minutes / 60).toFixed(1)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{row.attendees}</td>
                      <td className="px-4 py-2.5 text-muted">{t(`basis${row.basis}`)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{money(row.payCents)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line-strong">
                    <td className="px-5 py-2.5 font-medium" colSpan={5}>
                      {t("payrollTotal")}
                    </td>
                    <td className="px-4 py-2.5 text-right font-display text-base font-semibold tabular-nums">
                      {money(payrollTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </Card>

      <Card className="mb-5">
        <CardHeader title={t("exports")} />
        <CardBody className="flex flex-wrap gap-2">
          {EXPORTS.map(([kind, label]) => (
            <a
              key={kind}
              href={`/api/export/${kind}${exportQuery}`}
              className={buttonClass("secondary", "sm")}
            >
              {t(label)}
            </a>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("auditLog")} />
        {audit.length === 0 ? (
          <EmptyState message={t("auditEmpty")} />
        ) : (
          <ul className="divide-y divide-line">
            {audit.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-2.5 text-sm sm:px-5"
              >
                <span className="font-medium text-ink">
                  {entry.actor?.name ?? entry.actorLabel ?? "—"}
                </span>
                <code className="rounded bg-sunken px-1.5 py-0.5 text-xs text-ink-soft">
                  {entry.action}
                </code>
                <span className="ml-auto text-xs text-muted">
                  {formatDateTime(entry.createdAt, studio.timezone, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
