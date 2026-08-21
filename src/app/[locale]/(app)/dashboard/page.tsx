import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth/guards";
import { billingWarning, subscriptionFor } from "@/lib/billing";
import { db } from "@/lib/db";
import { ensureInstances } from "@/lib/classes";
import { addDays, formatTime, startOfDayInZone, startOfMonthInZone } from "@/lib/dates";
import { currentLocationId, locationScope } from "@/lib/locations";
import { formatMoney } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { RingMeter } from "@/components/ui/meter";
import { Badge } from "@/components/ui/badge";
import { EmptyState, SectionLabel } from "@/components/ui/page-header";

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
  const tb = await getTranslations("billing");

  // Keep the calendar filled without a cron job.
  await ensureInstances(studio);

  const now = new Date();
  const dayStart = startOfDayInZone(now, studio.timezone);
  const dayEnd = addDays(dayStart, 1);
  const monthStart = startOfMonthInZone(now, studio.timezone);

  const locationId = await currentLocationId(studio.id);
  // A student belongs to sucursales; money and classes follow from that.
  const atLocation = locationId ? { locations: { some: { id: locationId } } } : {};

  const [todayClasses, activeStudents, pendingPayments, monthTx, upcoming, counts] =
    await Promise.all([
      db.classInstance.findMany({
        where: {
          studioId: studio.id,
          startsAt: { gte: dayStart, lt: dayEnd },
          status: "SCHEDULED",
          ...locationScope(locationId),
        },
        orderBy: { startsAt: "asc" },
        include: {
          instructor: { include: { user: true } },
          _count: { select: { bookings: { where: { status: { in: ["BOOKED", "ATTENDED"] } } } } },
        },
      }),
      db.user.count({
        where: {
          studioId: studio.id,
          role: "STUDENT",
          isActive: true,
          ...(locationId ? { studentProfile: atLocation } : {}),
        },
      }),
      db.payment.count({
        where: {
          studioId: studio.id,
          status: "PENDING",
          ...(locationId ? { student: atLocation } : {}),
        },
      }),
      db.transaction.groupBy({
        by: ["type"],
        where: { studioId: studio.id, occurredAt: { gte: monthStart } },
        _sum: { amountCents: true },
      }),
      db.classInstance.findMany({
        where: {
          studioId: studio.id,
          startsAt: { gte: dayEnd },
          status: "SCHEDULED",
          ...locationScope(locationId),
        },
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
        db.instructorProfile.count({
          where: { user: { studioId: studio.id, isActive: true } },
        }),
      ]),
    ]);

  const income = monthTx.find((r) => r.type === "INCOME")?._sum.amountCents ?? 0;
  const expenses = monthTx.find((r) => r.type === "EXPENSE")?._sum.amountCents ?? 0;
  const net = income - expenses;

  const [locationCount, templateCount, packCount, teacherCount] = counts;
  /*
    In the order the data depends on itself, matching the guided tour. A class
    is assigned to a teacher, so listing classes first sent people off to build
    a timetable with nobody to teach it — and left the studio wondering why the
    teacher dropdown was empty.
  */
  const setupSteps = [
    { done: locationCount > 0, label: t("setupLocation"), href: "/settings" },
    { done: teacherCount > 0, label: t("setupTeacher"), href: "/settings" },
    { done: packCount > 0, label: t("setupPack"), href: "/packs" },
    { done: templateCount > 0, label: t("setupClass"), href: "/classes" },
    { done: activeStudents > 0, label: t("setupStudent"), href: "/students" },
  ];
  const setupIncomplete = setupSteps.some((step) => !step.done);

  const trialDaysLeft = studio.trialEndsAt
    ? Math.max(0, Math.ceil((studio.trialEndsAt.getTime() - now.getTime()) / 86_400_000))
    : null;

  const money = (cents: number) => formatMoney(cents, studio.currency, locale);

  // Split today into what is still ahead and what has already run.
  const remaining = todayClasses.filter((k) => k.startsAt.getTime() >= now.getTime());
  const current =
    todayClasses.find(
      (k) => k.startsAt <= now && new Date(k.startsAt.getTime() + 90 * 60_000) > now,
    ) ?? null;
  const focus = current ?? remaining[0] ?? null;
  const laterToday = remaining.filter((k) => k.id !== focus?.id);

  const todayLabel = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: studio.timezone,
  }).format(now);

  /*
    An instructor teaches; they do not run the studio. Everything below is
    management: unpaid invoices, the setup checklist, the month's balance. It
    was previously shown to every staff role, which both leaked the studio's
    finances to its teachers and handed them chips linking to pages the role
    guards immediately bounce them out of.
  */
  const manages = ADMIN_ROLES.includes(user.role);

  const attention = !manages
    ? []
    : ([
        pendingPayments > 0 && {
          label: t("pendingPayments"),
          value: pendingPayments,
          href: "/payments",
        },
        ...setupSteps.filter((step) => !step.done).map((step) => ({
          label: step.label,
          value: null as number | null,
          href: step.href,
        })),
      ].filter(Boolean) as { label: string; value: number | null; href: string }[]);

  /*
    Money owed to us, shown only to the person who can do something about it.
    A warning here never gates anything — a studio behind on its bill keeps
    working, and cutting one off stays a deliberate call from the console.
  */
  const billing =
    user.role === "OWNER" ? billingWarning(studio, await subscriptionFor(studio.id), now) : null;

  return (
    <>
      {billing && (
        <Link
          href="/billing"
          className={`pressable mb-4 block rounded-[var(--radius-lg)] px-4 py-3 text-sm ${
            billing === "pastDue"
              ? "bg-critical-soft text-critical"
              : "bg-caution-soft text-caution"
          }`}
        >
          {tb(`warning.${billing}`)}
        </Link>
      )}
      {/*
        The day comes first. A studio owner opening this between classes wants
        one question answered — what is happening now — not a wall of metrics.
      */}
      <section className="card-feature mb-4 px-5 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-ink/60">
          {todayLabel}
        </p>
        <h1 className="mt-1 text-[26px] leading-tight text-ink sm:text-3xl">
          {t("greeting", { name: user.name.split(" ")[0] })}
        </h1>

        {focus ? (
          <Link
            href={`/schedule/${focus.id}`}
            className="pressable mt-4 flex items-center gap-4 rounded-[var(--radius-lg)] bg-surface px-4 py-3.5 shadow-soft"
          >
            <span
              className="h-11 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: focus.colorHex }}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
                {current ? t("happeningNow") : t("nextUp")}
              </span>
              <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                <span className="font-display text-2xl font-semibold tabular-nums text-ink">
                  {formatTime(focus.startsAt, studio.timezone, locale)}
                </span>
                <span className="truncate text-[15px] text-ink">{focus.name}</span>
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted">
                {focus.instructor?.user.name ?? ts("unassigned")}
              </span>
            </span>
            <RingMeter filled={focus._count.bookings} total={focus.capacity} size={48} />
          </Link>
        ) : (
          <p className="mt-4 rounded-[var(--radius-lg)] bg-surface px-4 py-4 text-sm text-muted shadow-soft">
            {t("noClassesTodayCalm")}
          </p>
        )}

        <p className="mt-3 text-xs text-accent-ink/70">
          {todayClasses.length === 1
            ? t("oneClassToday")
            : t("classesToday", { count: todayClasses.length })}
          {studio.plan === "TRIAL" && trialDaysLeft !== null
            ? ` · ${t("trialBanner", { days: trialDaysLeft })}`
            : ""}
        </p>
      </section>

      {/* Only appears when something actually needs doing. */}
      {attention.length > 0 && (
        <section className="mb-4">
          <SectionLabel>{t("needsAttention")}</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {attention.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="pressable inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-accent/25 bg-accent-soft px-3.5 py-2 text-sm text-accent-ink"
              >
                {item.value !== null && (
                  <span className="flex size-5 items-center justify-center rounded-full bg-accent text-[11px] font-semibold tabular-nums text-white">
                    {item.value}
                  </span>
                )}
                {item.label}
              </Link>
            ))}
          </div>
        </section>
      )}

      {laterToday.length > 0 && (
        <section className="mb-4">
          <SectionLabel>{t("restOfDay")}</SectionLabel>
          <Card>
            <ul className="divide-y divide-line">
              {laterToday.map((klass) => (
                <ClassRow
                  key={klass.id}
                  klass={klass}
                  timezone={studio.timezone}
                  locale={locale}
                  fullLabel={ts("full")}
                />
              ))}
            </ul>
          </Card>
        </section>
      )}

      {/* Numbers live below the fold: useful, but not the daily question. */}
      <section className={`mb-4 grid gap-3 ${manages ? "grid-cols-2" : "grid-cols-1"}`}>
        <Link href="/students" className="pressable card px-4 py-3.5">
          <p className="text-[11px] uppercase tracking-wider text-muted">{t("studentsShort")}</p>
          <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-ink">
            {activeStudents}
          </p>
        </Link>
        {manages && (
          <Link href="/reports" className="pressable card px-4 py-3.5">
            <p className="text-[11px] uppercase tracking-wider text-muted">{t("balanceShort")}</p>
            <p
              className={`mt-1 font-display text-2xl font-semibold tabular-nums ${
                net >= 0 ? "text-positive" : "text-critical"
              }`}
            >
              {money(net)}
            </p>
          </Link>
        )}
      </section>

      <section>
        <SectionLabel>{t("upcoming")}</SectionLabel>
        <Card>
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
      </section>
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
