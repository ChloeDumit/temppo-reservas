import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { ADMIN_ROLES } from "@/lib/auth/guards";
import type { SessionUser } from "@/lib/auth/session";
import { addDays, dateKeyInZone, formatTime, startOfMonthInZone, startOfWeekInZone, wallTimeToUtc } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { appUrlFor } from "@/lib/brand/url";
import { localePath } from "@/i18n/routing";
import { shiftDateKey } from "@/lib/appointments/slots";
import { liveAppointmentFilter } from "@/lib/appointments/availability";
import { agendaInclude, newAppointmentOptions, toAgendaView, workingStaff } from "@/lib/appointments/agenda-data";
import { rebookText, waLink } from "@/lib/appointments/whatsapp-text";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { BarChart } from "@/components/ui/bar-chart";
import { Stat } from "@/components/ui/stat";
import { SheetForm } from "@/components/app/sheet-form";
import { CopyButton } from "@/components/app/copy-button";
import { Icon } from "@/components/app/icon";
import { AppointmentSheet, DepositPaid, STATUS_TONE } from "../agenda/appointment-sheet";
import { NewAppointmentForm } from "../agenda/new-appointment-form";
import { TimeOffForm } from "../hours/time-off-form";

const DAY = 86_400_000;

/** One panel on the home screen: a title, an optional link out, its content. */
function Widget({
  title,
  action,
  className,
  children,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("card flex flex-col", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {action}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  );
}

/**
 * Home for an appointment business: today first, the few things that need a
 * hand (deposits to approve, clients to invite back), and the shortcuts used
 * every day. Laid out for a phone in one column, a tablet in two, a desk in
 * three on a wide screen — the same widgets, rearranged.
 */
export async function BeautyDashboard({ user, locale }: { user: SessionUser; locale: string }) {
  const studio = user.studio;
  const tz = studio.timezone;
  const t = await getTranslations("home");
  const isAdmin = ADMIN_ROLES.includes(user.role);
  const now = new Date();
  const today = dateKeyInZone(now, tz);
  const dayStart = wallTimeToUtc(today, "00:00", tz);
  const weekStart = startOfWeekInZone(now, tz);
  const weekEnd = addDays(weekStart, 7);
  const monthStart = startOfMonthInZone(now, tz);

  const working = await workingStaff(studio.id);
  const staffIds = (isAdmin ? working : working.filter((s) => s.id === user.id)).map((s) => s.id);
  const mineOnly = { staffId: { in: staffIds } };

  const [todays, week, upcoming7, hours, monthDone, monthNoShows, newClients, monthIncome, pendingDeposits, rebookCandidates, options] =
    await Promise.all([
      db.appointment.findMany({
        where: { studioId: studio.id, ...mineOnly, startsAt: { gte: dayStart, lt: addDays(dayStart, 1) }, status: { notIn: ["CANCELLED", "LATE_CANCELLED", "EXPIRED"] } },
        include: agendaInclude,
        orderBy: { startsAt: "asc" },
      }),
      db.appointment.findMany({
        where: { studioId: studio.id, ...mineOnly, startsAt: { gte: weekStart, lt: weekEnd }, status: { in: ["CONFIRMED", "PENDING_PAYMENT", "COMPLETED"] } },
        select: { startsAt: true, endsAt: true },
      }),
      db.appointment.findMany({
        where: { studioId: studio.id, ...mineOnly, startsAt: { gte: dayStart, lt: addDays(dayStart, 7) }, ...liveAppointmentFilter(now) },
        select: { startsAt: true },
      }),
      db.workingHours.findMany({ where: { studioId: studio.id, ...mineOnly } }),
      db.appointment.findMany({
        where: { studioId: studio.id, ...mineOnly, status: "COMPLETED", startsAt: { gte: monthStart } },
        select: { priceCents: true },
      }),
      db.appointment.count({ where: { studioId: studio.id, ...mineOnly, status: "NO_SHOW", startsAt: { gte: monthStart } } }),
      db.studentProfile.count({ where: { user: { studioId: studio.id, role: "STUDENT" }, createdAt: { gte: monthStart } } }),
      isAdmin
        ? db.transaction.aggregate({ where: { studioId: studio.id, type: "INCOME", occurredAt: { gte: monthStart } }, _sum: { amountCents: true } })
        : null,
      // Every appointment still owing its deposit, whether or not the client
      // said how she would pay.
      db.appointment.findMany({
        where: { studioId: studio.id, ...mineOnly, status: "PENDING_PAYMENT", startsAt: { gte: addDays(dayStart, -1) } },
        include: agendaInclude,
        orderBy: { startsAt: "asc" },
        take: 20,
      }),
      db.appointment.findMany({
        where: {
          studioId: studio.id,
          ...mineOnly,
          status: "COMPLETED",
          service: { rebookAfterDays: { not: null } },
          startsAt: { gt: new Date(now.getTime() - 200 * DAY) },
        },
        include: { service: true, client: { include: { user: true } } },
        orderBy: { startsAt: "desc" },
      }),
      newAppointmentOptions(studio.id),
    ]);

  const money = (cents: number) => formatMoney(cents, studio.currency, locale);
  const bookingUrl = `${appUrlFor(studio)}${localePath(studio.locale, `/b/${studio.slug}`)}`;
  const staffOptions = working.map((s) => ({ id: s.id, name: s.name }));

  // How full the week is: booked time over the time on the shifts.
  const workMin = hours.reduce((sum, h) => sum + (h.endMin - h.startMin), 0);
  const bookedMin = week.reduce((sum, a) => sum + (a.endsAt.getTime() - a.startsAt.getTime()) / 60_000, 0);
  const occupancy = workMin ? Math.round((bookedMin / workMin) * 100) : null;

  const nextUp = todays.find((a) => a.endsAt > now && (a.status === "CONFIRMED" || a.status === "PENDING_PAYMENT"));
  const pendingToday = todays.filter((a) => a.status === "PENDING_PAYMENT").length;

  // The next seven days at a glance.
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: tz });
  const bars = Array.from({ length: 7 }, (_, i) => {
    const key = shiftDateKey(today, i);
    return {
      label: dayFmt.format(wallTimeToUtc(key, "12:00", tz)).replace(".", ""),
      value: upcoming7.filter((a) => dateKeyInZone(a.startsAt, tz) === key).length,
    };
  });

  // Clients whose cycle has come round and who have nothing booked.
  const futureByClient = new Set(
    (
      await db.appointment.findMany({
        where: { studioId: studio.id, startsAt: { gt: now }, ...liveAppointmentFilter(now) },
        select: { clientId: true },
      })
    ).map((a) => a.clientId),
  );
  const seen = new Set<string>();
  const dueBack = rebookCandidates
    .filter((a) => {
      if (seen.has(a.clientId)) return false;
      seen.add(a.clientId);
      const due = a.startsAt.getTime() + a.service!.rebookAfterDays! * DAY;
      return due <= now.getTime() + 3 * DAY && due > now.getTime() - 45 * DAY && !futureByClient.has(a.clientId);
    })
    .slice(0, 5);

  const done = monthDone.length;
  const avgTicket = done ? Math.round(monthDone.reduce((s, a) => s + a.priceCents, 0) / done) : 0;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">
            {new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: tz })
              .format(now)
              .replace(/^./, (c) => c.toUpperCase())}
          </p>
          <h1 className="text-[22px] leading-tight text-ink sm:text-3xl">{t("hello", { name: user.name.split(" ")[0] })}</h1>
        </div>
      </div>

      {/* ---------------------------------------------------------- numbers */}
      <div className={cn("mb-4 grid grid-cols-2 gap-3", isAdmin ? "md:grid-cols-4" : "md:grid-cols-3")}>
        <Stat
          label={t("today")}
          value={String(todays.length)}
          hint={pendingToday ? t("pendingDeposit", { count: pendingToday }) : t("appointments", { count: todays.length })}
        />
        <Stat
          label={t("thisWeek")}
          value={occupancy === null ? String(week.length) : `${occupancy}%`}
          hint={occupancy === null ? t("appointments", { count: week.length }) : t("occupancy", { count: week.length })}
          tone={occupancy !== null && occupancy >= 80 ? "positive" : undefined}
        />
        {isAdmin && monthIncome && (
          <Stat label={t("income")} value={money(monthIncome._sum.amountCents ?? 0)} hint={t("incomeHint")} tone="positive" />
        )}
        {isAdmin ? (
          <Stat
            label={t("toApprove")}
            value={String(pendingDeposits.length)}
            tone={pendingDeposits.length ? "critical" : undefined}
            href={
              pendingDeposits.length ? (
                <a href="#senas" className="mt-1 inline-block text-xs font-medium text-accent">
                  {t("review")} →
                </a>
              ) : (
                <p className="mt-0.5 text-xs text-muted">{t("allClear")}</p>
              )
            }
          />
        ) : (
          <Stat label={t("noShows")} value={String(monthNoShows)} hint={t("thisMonth")} />
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* --------------------------------------------- deposits owed: the most urgent thing on the page */}
        {pendingDeposits.length > 0 && (
          <Widget title={t("depositsTitle", { count: pendingDeposits.length })} className="scroll-mt-20 md:col-span-2 xl:col-span-3">
            <ul id="senas" className="divide-y divide-line">
              {pendingDeposits.map((a) => {
                const v = toAgendaView(a, studio, locale, now);
                return (
                  <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                    <AppointmentSheet appt={v} staff={staffOptions} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm font-medium text-ink">{v.clientName}</span>
                      <span className="block truncate text-xs text-muted">
                        {new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: tz }).format(a.startsAt)},{" "}
                        {formatTime(a.startsAt, tz, locale)} · {v.serviceName}
                      </span>
                    </AppointmentSheet>
                    <span className="text-sm tabular-nums text-ink">
                      {v.deposit}
                      {v.transferCode ? (
                        <span className="ml-2 rounded bg-sunken px-1.5 py-0.5 font-mono text-xs text-ink-soft">{v.transferCode}</span>
                      ) : (
                        <span className="ml-2 text-xs text-muted">{t("noMethodYet")}</span>
                      )}
                    </span>
                    <DepositPaid appt={v} compact />
                  </li>
                );
              })}
            </ul>
          </Widget>
        )}

        {/* ------------------------------------------------------- today */}
        <Widget
          title={t("todayTitle")}
          className="md:row-span-2 xl:col-span-2"
          action={
            <Link href="/agenda" className="text-sm font-medium text-accent">
              {t("openAgenda")} →
            </Link>
          }
        >
          {todays.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted">{t("nothingToday")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {todays.map((a) => {
                const v = toAgendaView(a, studio, locale, now);
                const isNext = a.id === nextUp?.id;
                const past = a.endsAt <= now;
                return (
                  <li key={a.id} className={cn(isNext && "bg-accent-soft/60")}>
                    <AppointmentSheet appt={v} staff={staffOptions} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-sunken">
                      <span className={cn("w-12 shrink-0 text-sm font-semibold tabular-nums", past ? "text-muted" : "text-ink")}>
                        {formatTime(a.startsAt, tz, locale)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={cn("truncate text-sm font-medium", past ? "text-ink-soft" : "text-ink")}>{v.clientName}</span>
                          {v.allergies && <Icon name="alert" className="size-3.5 shrink-0 text-critical" />}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {v.serviceName}
                          {working.length > 1 ? ` · ${v.staffName}` : ""}
                        </span>
                      </span>
                      {isNext ? (
                        <Badge tone="accent">{a.startsAt <= now ? t("now") : t("next")}</Badge>
                      ) : (
                        a.status !== "CONFIRMED" && <Badge tone={STATUS_TONE[a.status]}>{t(`status${a.status}` as "statusCOMPLETED")}</Badge>
                      )}
                    </AppointmentSheet>
                  </li>
                );
              })}
            </ul>
          )}
        </Widget>

        {/* ---------------------------------------------------- shortcuts */}
        <Widget title={t("shortcuts")}>
          <div className="grid grid-cols-2 gap-2 p-3">
            <SheetForm label={t("newAppointment")} title={t("newAppointment")} variant="primary" size="md" className="min-h-16! w-full flex-col gap-1 whitespace-normal! rounded-[var(--radius-md)]! py-3">
              <NewAppointmentForm
                clients={options.clients}
                services={options.services}
                staff={staffOptions}
                defaultStaffId={staffIds[0] ?? user.id}
                defaultDate={today}
              />
            </SheetForm>
            <SheetForm label={t("blockTime")} title={t("blockTime")} variant="secondary" size="md" icon="clock" className="min-h-16! w-full flex-col gap-1 whitespace-normal! rounded-[var(--radius-md)]! py-3">
              <TimeOffForm
                staff={working.filter((s) => isAdmin || s.id === user.id).map((s) => ({ id: s.id, name: s.name }))}
                defaultStaffId={user.id}
                canCloseStudio={isAdmin}
                today={today}
              />
            </SheetForm>
            <Link
              href={`/b/${studio.slug}`}
              target="_blank"
              className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border border-line bg-surface px-2 py-3 text-center text-sm font-medium text-ink hover:border-accent"
            >
              <Icon name="eye" className="size-4" />
              {t("viewPage")}
            </Link>
            <Link
              href="/clients"
              className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border border-line bg-surface px-2 py-3 text-center text-sm font-medium text-ink hover:border-accent"
            >
              <Icon name="users" className="size-4" />
              {t("findClient")}
            </Link>
          </div>
          <div className="border-t border-line px-4 py-3">
            <p className="mb-2 text-xs text-muted">{t("shareHint")}</p>
            <CopyButton value={bookingUrl} label={t("copyLink")} copiedLabel={t("copied")} />
          </div>
        </Widget>

        {/* ---------------------------------------------------- next days */}
        <Widget
          title={t("nextDays")}
          action={
            <Link href="/agenda?view=week" className="text-sm font-medium text-accent">
              {t("week")} →
            </Link>
          }
        >
          <div className="px-4 py-3">
            <BarChart bars={bars} formatValue={(v) => String(v)} emptyLabel={t("nothingNextDays")} />
          </div>
        </Widget>

        {/* ------------------------------------------------- come back */}
        <Widget title={t("comeBack")} className="xl:col-span-2">
          {dueBack.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">{t("comeBackEmpty")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {dueBack.map((a) => {
                const client = a.client.user;
                const link = waLink(client.phone, rebookText(a.serviceName, studio, client.name, bookingUrl));
                const days = Math.round((now.getTime() - a.startsAt.getTime()) / DAY);
                return (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                    <Link href={`/clients/${a.clientId}`} className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{client.name}</span>
                      <span className="block truncate text-xs text-muted">{t("lastService", { service: a.serviceName, days })}</span>
                    </Link>
                    {link && (
                      <a href={link} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white">
                        WhatsApp
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Widget>

        {/* ---------------------------------------------------- the month */}
        <Widget title={t("thisMonthTitle")}>
          <dl className="grid grid-cols-2 gap-px bg-line">
            {[
              { label: t("done"), value: String(done) },
              { label: t("noShows"), value: String(monthNoShows) },
              { label: t("newClients"), value: String(newClients) },
              { label: t("avgTicket"), value: done ? money(avgTicket) : "—" },
            ].map((item) => (
              <div key={item.label} className="bg-surface px-4 py-3">
                <dt className="text-xs text-muted">{item.label}</dt>
                <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums text-ink">{item.value}</dd>
              </div>
            ))}
          </dl>
        </Widget>
      </div>
    </>
  );
}
