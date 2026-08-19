import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { ensureInstances } from "@/lib/classes";
import { addDays, formatTime, startOfDayInZone, startOfMonthInZone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireStaff();
  const studio = user.studio;
  const t = await getTranslations("dashboard");
  const ts = await getTranslations("schedule");

  // Keep the calendar filled without a cron job.
  await ensureInstances(studio);

  const now = new Date();
  const dayStart = startOfDayInZone(now, studio.timezone);
  const dayEnd = addDays(dayStart, 1);
  const monthStart = startOfMonthInZone(now, studio.timezone);

  const [todayClasses, activeStudents, pendingPayments, monthTx, upcoming, counts] =
    await Promise.all([
      db.classInstance.findMany({
        where: {
          studioId: studio.id,
          startsAt: { gte: dayStart, lt: dayEnd },
          status: "SCHEDULED",
        },
        orderBy: { startsAt: "asc" },
        include: {
          instructor: { include: { user: true } },
          _count: { select: { bookings: { where: { status: { in: ["BOOKED", "ATTENDED"] } } } } },
        },
      }),
      db.user.count({ where: { studioId: studio.id, role: "STUDENT", isActive: true } }),
      db.payment.count({ where: { studioId: studio.id, status: "PENDING" } }),
      db.transaction.groupBy({
        by: ["type"],
        where: { studioId: studio.id, occurredAt: { gte: monthStart } },
        _sum: { amountCents: true },
      }),
      db.classInstance.findMany({
        where: { studioId: studio.id, startsAt: { gte: dayEnd }, status: "SCHEDULED" },
        orderBy: { startsAt: "asc" },
        take: 5,
        include: {
          instructor: { include: { user: true } },
          _count: { select: { bookings: { where: { status: { in: ["BOOKED", "ATTENDED"] } } } } },
        },
      }),
      Promise.all([
        db.location.count({ where: { studioId: studio.id } }),
        db.classTemplate.count({ where: { studioId: studio.id } }),
        db.classPack.count({ where: { studioId: studio.id } }),
      ]),
    ]);

  const income = monthTx.find((r) => r.type === "INCOME")?._sum.amountCents ?? 0;
  const expenses = monthTx.find((r) => r.type === "EXPENSE")?._sum.amountCents ?? 0;
  const net = income - expenses;

  const [locationCount, templateCount, packCount] = counts;
  const setupSteps = [
    { done: locationCount > 0, label: t("setupLocation"), href: "/settings" },
    { done: templateCount > 0, label: t("setupClass"), href: "/classes" },
    { done: packCount > 0, label: t("setupPack"), href: "/packs" },
    { done: activeStudents > 0, label: t("setupStudent"), href: "/students" },
  ];
  const setupIncomplete = setupSteps.some((step) => !step.done);

  const trialDaysLeft = studio.trialEndsAt
    ? Math.max(0, Math.ceil((studio.trialEndsAt.getTime() - now.getTime()) / 86_400_000))
    : null;

  const money = (cents: number) => formatMoney(cents, studio.currency, locale);

  return (
    <>
      <PageHeader title={t("greeting", { name: user.name.split(" ")[0] })} />

      {studio.plan === "TRIAL" && trialDaysLeft !== null && (
        <p className="mb-5 rounded-lg bg-accent-soft px-4 py-2.5 text-sm text-accent-ink">
          {t("trialBanner", { days: trialDaysLeft })}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("todayClasses")} value={todayClasses.length} />
        <Stat label={t("activeStudents")} value={activeStudents} />
        <Stat
          label={t("pendingPayments")}
          value={pendingPayments}
          tone={pendingPayments > 0 ? "accent" : undefined}
          href={
            pendingPayments > 0 ? (
              <Link
                href="/payments"
                className="mt-1 inline-block text-xs text-accent underline underline-offset-4"
              >
                {t("reviewPayments")}
              </Link>
            ) : undefined
          }
        />
        <Stat
          label={t("monthBalance")}
          value={money(net)}
          tone={net >= 0 ? "positive" : "critical"}
          hint={`${t("income")} ${money(income)} · ${t("expenses")} ${money(expenses)}`}
        />
      </div>

      {setupIncomplete && (
        <Card className="mt-5">
          <CardHeader title={t("setupTitle")} />
          <CardBody className="space-y-2">
            {setupSteps.map((step) => (
              <Link
                key={step.label}
                href={step.href}
                className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-sunken"
              >
                <span
                  className={
                    step.done
                      ? "flex size-5 items-center justify-center rounded-full bg-positive-soft text-positive"
                      : "size-5 rounded-full border border-line-strong"
                  }
                >
                  {step.done ? "✓" : ""}
                </span>
                <span className={step.done ? "text-muted line-through" : "text-ink"}>
                  {step.label}
                </span>
              </Link>
            ))}
          </CardBody>
        </Card>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={t("todayClasses")}
            action={
              <Link href="/schedule" className={buttonClass("secondary", "sm")}>
                {ts("title")}
              </Link>
            }
          />
          {todayClasses.length === 0 ? (
            <EmptyState message={t("noClassesToday")} />
          ) : (
            <ul className="divide-y divide-line">
              {todayClasses.map((klass) => (
                <ClassRow
                  key={klass.id}
                  klass={klass}
                  timezone={studio.timezone}
                  locale={locale}
                  fullLabel={ts("full")}
                />
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title={t("upcoming")} />
          {upcoming.length === 0 ? (
            <EmptyState message={ts("noClassesWeek")} />
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.map((klass) => (
                <ClassRow
                  key={klass.id}
                  klass={klass}
                  timezone={studio.timezone}
                  locale={locale}
                  fullLabel={ts("full")}
                  showDate
                />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

type RowClass = {
  id: string;
  name: string;
  colorHex: string;
  startsAt: Date;
  capacity: number;
  instructor: { user: { name: string } } | null;
  _count: { bookings: number };
};

function ClassRow({
  klass,
  timezone,
  locale,
  fullLabel,
  showDate,
}: {
  klass: RowClass;
  timezone: string;
  locale: string;
  fullLabel: string;
  showDate?: boolean;
}) {
  const full = klass._count.bookings >= klass.capacity;
  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <span
        className="h-9 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: klass.colorHex }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{klass.name}</p>
        <p className="truncate text-xs text-muted">
          {showDate
            ? new Intl.DateTimeFormat(locale, {
                weekday: "short",
                day: "numeric",
                month: "short",
                timeZone: timezone,
              }).format(klass.startsAt)
            : formatTime(klass.startsAt, timezone, locale)}
          {klass.instructor ? ` · ${klass.instructor.user.name}` : ""}
        </p>
      </div>
      {full ? (
        <Badge tone="caution">{fullLabel}</Badge>
      ) : (
        <span className="shrink-0 text-xs tabular-nums text-muted">
          {klass._count.bookings}/{klass.capacity}
        </span>
      )}
    </li>
  );
}
