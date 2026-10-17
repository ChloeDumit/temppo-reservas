import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { ADMIN_ROLES } from "@/lib/auth/guards";
import { requireAppointmentStaff } from "@/lib/appointments/guards";
import { addDays, dateKeyInZone, formatTime, inZone, startOfWeekInZone, wallTimeToUtc } from "@/lib/dates";
import { appUrlFor } from "@/lib/brand/url";
import { localePath } from "@/i18n/routing";
import { shiftDateKey } from "@/lib/appointments/slots";
import { agendaInclude, newAppointmentOptions, staffPalette, toAgendaView, workingStaff } from "@/lib/appointments/agenda-data";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { SheetForm } from "@/components/app/sheet-form";
import { CopyButton } from "@/components/app/copy-button";
import { AppointmentSheet, STATUS_TONE } from "./appointment-sheet";
import { NewAppointmentForm } from "./new-appointment-form";

const PX_PER_MIN = 1.1;
const HIDDEN = ["CANCELLED", "LATE_CANCELLED", "EXPIRED"];
type View = "day" | "week" | "month";

function minutesOf(date: Date, tz: string) {
  const z = inZone(date, tz);
  return z.getHours() * 60 + z.getMinutes();
}

/** Monday-first weekday of a "YYYY-MM-DD" key: 0 = Monday … 6 = Sunday. */
function mondayIndex(key: string) {
  return (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7;
}

const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Lays out one day's appointments the way calendars do: each group of
 * appointments that overlap shares the width, everything else gets all of it.
 */
function overlapLayout(items: { id: string; startsAt: Date; endsAt: Date }[]) {
  const sorted = [...items].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const result = new Map<string, { lane: number; lanes: number }>();
  let group: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;

  const close = () => {
    for (const g of group) result.set(g.id, { lane: g.lane, lanes: laneEnds.length });
    group = [];
    laneEnds = [];
  };

  for (const a of sorted) {
    const start = a.startsAt.getTime();
    if (start >= groupEnd) close();
    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane === -1) lane = laneEnds.push(0) - 1;
    laneEnds[lane] = a.endsAt.getTime();
    group.push({ id: a.id, lane });
    groupEnd = Math.max(groupEnd === -Infinity ? 0 : groupEnd, a.endsAt.getTime());
  }
  close();
  return result;
}

export default async function AgendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ date?: string; view?: string; staff?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;

  const user = await requireAppointmentStaff();
  const studio = user.studio;
  const tz = studio.timezone;
  const t = await getTranslations("agenda");
  const isAdmin = ADMIN_ROLES.includes(user.role);

  const now = new Date();
  const today = dateKeyInZone(now, tz);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(query.date ?? "") ? query.date! : today;
  const view: View = query.view === "week" || query.view === "month" ? query.view : "day";

  // A professional sees her own column; whoever runs the place sees everyone.
  const working = await workingStaff(studio.id);
  const mine = isAdmin ? working : working.filter((s) => s.id === user.id);
  const visibleStaff = mine.filter((s) => !query.staff || s.id === query.staff);
  const staffIds = visibleStaff.map((s) => s.id);
  const palette = staffPalette(working.map((s) => s.id));

  // The range each view covers. A month runs whole weeks, Monday to Sunday,
  // so the grid has no ragged edges.
  let firstKey: string;
  let rangeDays: number;
  if (view === "day") {
    firstKey = date;
    rangeDays = 1;
  } else if (view === "week") {
    firstKey = dateKeyInZone(startOfWeekInZone(wallTimeToUtc(date, "12:00", tz), tz), tz);
    rangeDays = 7;
  } else {
    const monthFirst = `${date.slice(0, 7)}-01`;
    firstKey = shiftDateKey(monthFirst, -mondayIndex(monthFirst));
    const [y, m] = date.split("-").map(Number);
    const monthLast = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const lastKey = shiftDateKey(monthLast, 6 - mondayIndex(monthLast));
    rangeDays = Math.round((Date.parse(lastKey) - Date.parse(firstKey)) / 86_400_000) + 1;
  }
  const rangeStart = wallTimeToUtc(firstKey, "00:00", tz);
  const rangeEnd = wallTimeToUtc(shiftDateKey(firstKey, rangeDays), "00:00", tz);

  const [appointments, blocks, hours, options] = await Promise.all([
    db.appointment.findMany({
      where: { studioId: studio.id, staffId: { in: staffIds }, startsAt: { gte: rangeStart, lt: rangeEnd } },
      include: agendaInclude,
      orderBy: { startsAt: "asc" },
    }),
    db.timeOff.findMany({
      where: {
        studioId: studio.id,
        OR: [{ staffId: null }, { staffId: { in: staffIds } }],
        startsAt: { lt: rangeEnd },
        endsAt: { gt: rangeStart },
      },
    }),
    db.workingHours.findMany({ where: { studioId: studio.id, staffId: { in: staffIds } } }),
    newAppointmentOptions(studio.id),
  ]);

  const bookingUrl = `${appUrlFor(studio)}${localePath(studio.locale, `/b/${studio.slug}`)}`;
  const toView = (a: (typeof appointments)[number]) => toAgendaView(a, studio, locale, now);
  const allStaffOptions = working.map((s) => ({ id: s.id, name: s.name }));
  const visible = appointments.filter((a) => !HIDDEN.includes(a.status));
  const showStaffColour = visibleStaff.length > 1;

  // Navigation keeps the view and the staff filter.
  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const next = { date, view, staff: query.staff, ...over };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    return `/agenda?${p.toString()}`;
  };
  const step = (dir: 1 | -1) => {
    if (view === "day") return shiftDateKey(date, dir);
    if (view === "week") return shiftDateKey(date, 7 * dir);
    const [y, m] = date.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1 + dir, 1)).toISOString().slice(0, 10);
  };

  const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...opts, timeZone: tz });
  const noon = (key: string) => wallTimeToUtc(key, "12:00", tz);
  const title =
    view === "day"
      ? fmt({ weekday: "long", day: "numeric", month: "long" }).format(noon(date))
      : view === "week"
        ? `${fmt({ day: "numeric", month: "short" }).format(rangeStart)} – ${fmt({ day: "numeric", month: "short" }).format(addDays(rangeEnd, -1))}`
        : fmt({ month: "long", year: "numeric" }).format(noon(date));

  const newForm = (
    <SheetForm label={t("newAppointment")} title={t("newAppointment")}>
      <NewAppointmentForm
        clients={options.clients}
        services={options.services}
        staff={allStaffOptions}
        defaultStaffId={staffIds[0] ?? user.id}
        defaultDate={date}
      />
    </SheetForm>
  );

  const nav = (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link href={href({ date: step(-1) })} className="touch-target grid place-items-center rounded-full px-3 text-lg text-accent hover:bg-accent-soft" aria-label={t("previous")}>
            ‹
          </Link>
          <Link href={href({ date: today })} className="rounded-full px-3 py-1.5 text-sm font-medium text-ink hover:bg-sunken">
            {t("today")}
          </Link>
          <Link href={href({ date: step(1) })} className="touch-target grid place-items-center rounded-full px-3 text-lg text-accent hover:bg-accent-soft" aria-label={t("next")}>
            ›
          </Link>
          <span className="ml-2 text-sm font-semibold text-ink sm:text-base">{upperFirst(title)}</span>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-sunken p-1 text-sm">
          {(["day", "week", "month"] as const).map((v) => (
            <Link
              key={v}
              href={href({ view: v })}
              aria-current={view === v ? "page" : undefined}
              className={cn(
                "rounded-full px-3.5 py-1.5",
                view === v ? "bg-surface font-medium text-ink shadow-[var(--shadow-soft)]" : "text-muted hover:text-ink",
              )}
            >
              {t(v)}
            </Link>
          ))}
        </div>
      </div>

      {/* Who is shown: everyone, or one professional. Coloured to match the calendar. */}
      {mine.length > 1 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          <Link
            href={href({ staff: undefined })}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-sm",
              !query.staff ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-soft",
            )}
          >
            {t("everyone")}
          </Link>
          {mine.map((s) => (
            <Link
              key={s.id}
              href={href({ staff: s.id })}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm",
                query.staff === s.id ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-soft",
              )}
            >
              <span className="size-2.5 rounded-full" style={{ background: palette[s.id].border }} />
              {s.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );

  const shareLine = (
    <div className="mt-6 flex flex-wrap items-center gap-2 text-sm text-muted">
      {t("shareLink")} <span className="select-all font-medium text-ink">{bookingUrl}</span>
      <CopyButton value={bookingUrl} label={t("copy")} copiedLabel={t("copied")} />
    </div>
  );

  if (options.services.length === 0) {
    return (
      <>
        <PageHeader title={t("title")} />
        <Card>
          <EmptyState
            message={t("noServicesYet")}
            action={
              <Link href="/services" className="text-sm font-medium text-accent">
                {t("addServices")} →
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  const blockClass = (status: string) =>
    status === "PENDING_PAYMENT"
      ? "border-caution bg-caution-soft"
      : status === "NO_SHOW"
        ? "border-critical bg-critical-soft"
        : status === "COMPLETED"
          ? "border-positive bg-positive-soft"
          : "border-accent bg-accent-soft";

  // Colour by professional when several share a grid; by status otherwise.
  const blockStyle = (a: (typeof appointments)[number]) =>
    showStaffColour && a.status === "CONFIRMED"
      ? { background: palette[a.staffId].bg, borderColor: palette[a.staffId].border }
      : undefined;

  /* ------------------------------------------------------------ month */
  if (view === "month") {
    const keys = Array.from({ length: rangeDays }, (_, i) => shiftDateKey(firstKey, i));
    const weekdayNames = Array.from({ length: 7 }, (_, i) =>
      new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 5 + i))),
    );
    const month = date.slice(0, 7);
    const byDay = new Map<string, typeof visible>();
    for (const a of visible) {
      const key = dateKeyInZone(a.startsAt, tz);
      byDay.set(key, [...(byDay.get(key) ?? []), a]);
    }
    const closed = (key: string) =>
      blocks.some((b) => b.staffId === null && b.startsAt <= wallTimeToUtc(key, "09:00", tz) && b.endsAt >= wallTimeToUtc(key, "18:00", tz));

    return (
      <>
        <PageHeader title={t("title")} action={newForm} />
        {nav}
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line bg-sunken/60 text-center text-[11px] font-medium uppercase tracking-wide text-muted">
            {weekdayNames.map((d) => (
              <div key={d} className="py-2">
                {d.replace(".", "")}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {keys.map((key) => {
              const items = byDay.get(key) ?? [];
              const outside = key.slice(0, 7) !== month;
              const isToday = key === today;
              return (
                <div
                  key={key}
                  className={cn(
                    "relative min-h-[4.5rem] border-b border-r border-line p-1 [&:nth-child(7n)]:border-r-0 sm:min-h-[6.5rem] sm:p-1.5",
                    outside && "bg-sunken/50",
                    closed(key) && "bg-[repeating-linear-gradient(135deg,var(--color-line)_0_6px,transparent_6px_12px)]",
                  )}
                >
                  <Link
                    href={href({ date: key, view: "day" })}
                    className="absolute inset-0"
                    aria-label={fmt({ weekday: "long", day: "numeric", month: "long" }).format(noon(key))}
                  />
                  <span
                    className={cn(
                      "relative inline-grid size-6 place-items-center rounded-full text-xs tabular-nums",
                      isToday ? "bg-accent font-semibold text-white" : outside ? "text-muted" : "text-ink",
                    )}
                  >
                    {Number(key.slice(8))}
                  </span>
                  {/* Phones: a count. Tablets and up: the first few, by time. */}
                  {items.length > 0 && (
                    <span className="relative mt-1 block text-center text-[11px] font-semibold text-accent sm:hidden">
                      {items.length}
                    </span>
                  )}
                  <ul className="pointer-events-none relative mt-1 hidden space-y-0.5 sm:block">
                    {items.slice(0, 3).map((a) => (
                      <li
                        key={a.id}
                        className={cn("truncate rounded border-l-2 px-1 py-px text-[11px] text-ink", blockClass(a.status))}
                        style={blockStyle(a)}
                      >
                        <span className="tabular-nums text-ink-soft">{formatTime(a.startsAt, tz, locale)}</span>{" "}
                        {a.client.user.name.split(" ")[0]}
                      </li>
                    ))}
                    {items.length > 3 && <li className="px-1 text-[11px] text-muted">{t("more", { count: items.length - 3 })}</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </Card>
        {shareLine}
      </>
    );
  }

  /* ------------------------------------------------- shared time grid */
  const gridBounds = (days: string[]) => {
    const weekdays = new Set(days.map((k) => new Date(`${k}T12:00:00Z`).getUTCDay()));
    const shifts = hours.filter((h) => weekdays.has(h.weekday));
    const starts = [...shifts.map((h) => h.startMin), ...visible.map((a) => minutesOf(a.startsAt, tz))];
    const ends = [...shifts.map((h) => h.endMin), ...visible.map((a) => minutesOf(a.endsAt, tz) || 24 * 60)];
    const start = Math.floor((starts.length ? Math.min(...starts) : 9 * 60) / 60) * 60;
    const end = Math.min(24 * 60, Math.ceil((ends.length ? Math.max(...ends) : 19 * 60) / 60) * 60);
    return { start, end };
  };

  const timeGrid = (
    columns: { key: string; label: React.ReactNode; staffId?: string; date: string; highlight?: boolean }[],
    bounds: { start: number; end: number },
  ) => {
    const height = (bounds.end - bounds.start) * PX_PER_MIN;
    const marks = Array.from({ length: (bounds.end - bounds.start) / 60 + 1 }, (_, i) => bounds.start + i * 60);
    const pos = (min: number) => (Math.min(Math.max(min, bounds.start), bounds.end) - bounds.start) * PX_PER_MIN;
    const nowMin = minutesOf(now, tz);
    // Narrow day columns so a whole week fits a portrait tablet.
    const minWidth = view === "week" ? 5 : 11;

    return (
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <div className="flex min-w-full" style={{ width: `max(100%, ${3.5 + columns.length * minWidth}rem)` }}>
            <div className="sticky left-0 z-10 w-14 shrink-0 border-r border-line bg-surface">
              <div className="h-11 border-b border-line" />
              <div className="relative" style={{ height }}>
                {marks.map((m) => (
                  <span key={m} className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-muted" style={{ top: pos(m) }}>
                    {String(m / 60).padStart(2, "0")}:00
                  </span>
                ))}
              </div>
            </div>

            {columns.map((col) => {
              const weekday = new Date(`${col.date}T12:00:00Z`).getUTCDay();
              const colStaff = col.staffId ? [col.staffId] : staffIds;
              const shifts = hours.filter((h) => h.weekday === weekday && colStaff.includes(h.staffId));
              const dayStart = wallTimeToUtc(col.date, "00:00", tz);
              const dayEnd = addDays(dayStart, 1);
              const items = visible.filter(
                (a) => dateKeyInZone(a.startsAt, tz) === col.date && (!col.staffId || a.staffId === col.staffId),
              );
              const colBlocks = blocks.filter(
                (b) =>
                  b.startsAt < dayEnd &&
                  b.endsAt > dayStart &&
                  (b.staffId === null || (col.staffId ? b.staffId === col.staffId : staffIds.length === 1 && b.staffId === staffIds[0])),
              );

              // Side by side only where appointments actually overlap.
              const layout = overlapLayout(items);

              return (
                <div key={col.key} className="min-w-0 flex-1 border-r border-line last:border-r-0" style={{ minWidth: `${minWidth}rem` }}>
                  <div
                    className={cn(
                      "flex h-11 items-center justify-center border-b border-line px-1 text-center text-sm font-medium",
                      col.highlight ? "text-accent" : "text-ink",
                    )}
                  >
                    {col.label}
                  </div>
                  <div className="relative bg-sunken/60" style={{ height }}>
                    {/* Working time is the light ground; outside it stays shaded. */}
                    {shifts.map((h) => (
                      <div key={h.id} className="absolute inset-x-0 bg-surface" style={{ top: pos(h.startMin), height: pos(h.endMin) - pos(h.startMin) }} />
                    ))}
                    {marks.map((m) => (
                      <div key={m} className="absolute inset-x-0 border-t border-line/70" style={{ top: pos(m) }} />
                    ))}
                    {colBlocks.map((b) => {
                      const from = b.startsAt < dayStart ? bounds.start : minutesOf(b.startsAt, tz);
                      const to = b.endsAt >= dayEnd ? bounds.end : minutesOf(b.endsAt, tz);
                      return (
                        <div
                          key={b.id}
                          className="absolute inset-x-1 overflow-hidden rounded-md bg-[repeating-linear-gradient(135deg,var(--color-line)_0_6px,transparent_6px_12px)] px-2 py-1 text-[11px] text-muted"
                          style={{ top: pos(from), height: Math.max(pos(to) - pos(from), 16) }}
                        >
                          {b.reason ?? t("blocked")}
                        </div>
                      );
                    })}
                    {items.map((a) => {
                      const top = pos(minutesOf(a.startsAt, tz));
                      const h = Math.max(pos(minutesOf(a.endsAt, tz) || 24 * 60) - top, 26);
                      const { lane, lanes } = layout.get(a.id)!;
                      const laneWidth = 100 / lanes;
                      return (
                        <AppointmentSheet
                          key={a.id}
                          appt={toView(a)}
                          staff={allStaffOptions}
                          className={cn(
                            "absolute overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left shadow-[var(--shadow-soft)] transition-transform hover:z-10 hover:scale-[1.02]",
                            blockClass(a.status),
                          )}
                          style={{
                            top,
                            height: h,
                            left: `calc(${lane * laneWidth}% + 2px)`,
                            width: `calc(${laneWidth}% - 4px)`,
                            ...blockStyle(a),
                          }}
                        >
                          <span className="block truncate text-[12px] font-semibold text-ink">{a.client.user.name}</span>
                          <span className="block truncate text-[11px] text-ink-soft">
                            {formatTime(a.startsAt, tz, locale)} · {a.serviceName}
                          </span>
                        </AppointmentSheet>
                      );
                    })}
                    {col.date === today && nowMin >= bounds.start && nowMin <= bounds.end && (
                      <div className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-critical" style={{ top: pos(nowMin) }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    );
  };

  /* ------------------------------------------------------------- week */
  if (view === "week") {
    const days = Array.from({ length: 7 }, (_, i) => shiftDateKey(firstKey, i));
    const dayHeader = (key: string) => (
      <Link href={href({ date: key, view: "day" })} className="flex flex-col items-center leading-tight hover:text-accent">
        <span className="text-[11px] uppercase text-muted">{fmt({ weekday: "short" }).format(noon(key)).replace(".", "")}</span>
        <span className="tabular-nums">{Number(key.slice(8))}</span>
      </Link>
    );

    return (
      <>
        <PageHeader title={t("title")} action={newForm} />
        {nav}

        {/* Tablets and up: the week as a calendar. */}
        <div className="hidden md:block">
          {timeGrid(
            days.map((key) => ({ key, date: key, label: dayHeader(key), highlight: key === today })),
            gridBounds(days),
          )}
        </div>

        {/* Phones: seven columns would be unreadable, so the week is a list. */}
        <div className="space-y-4 md:hidden">
          {days.map((key) => {
            const items = visible.filter((a) => dateKeyInZone(a.startsAt, tz) === key);
            return (
              <section key={key}>
                <Link
                  href={href({ date: key, view: "day" })}
                  className={cn("mb-1.5 block px-1 text-sm font-semibold", key === today ? "text-accent" : "text-ink-soft")}
                >
                  {upperFirst(fmt({ weekday: "long", day: "numeric", month: "short" }).format(noon(key)))}
                </Link>
                {items.length === 0 ? (
                  <p className="px-1 text-sm text-muted">{t("nothing")}</p>
                ) : (
                  <Card>
                    <ul className="divide-y divide-line">
                      {items.map((a) => {
                        const v = toView(a);
                        return (
                          <li key={a.id}>
                            <AppointmentSheet appt={v} staff={allStaffOptions} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-sunken">
                              <span className="w-24 shrink-0 text-sm tabular-nums text-ink-soft">{v.timeLabel}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-ink">{v.clientName}</span>
                                <span className="block truncate text-xs text-muted">
                                  {v.serviceName}
                                  {showStaffColour ? ` · ${v.staffName}` : ""}
                                </span>
                              </span>
                              {a.status !== "CONFIRMED" && (
                                <Badge tone={STATUS_TONE[a.status]}>{t(`status${a.status}` as "statusCONFIRMED")}</Badge>
                              )}
                            </AppointmentSheet>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                )}
              </section>
            );
          })}
        </div>
        {shareLine}
      </>
    );
  }

  /* -------------------------------------------------------------- day */
  return (
    <>
      <PageHeader title={t("title")} action={newForm} />
      {nav}
      {visibleStaff.length === 0 ? (
        <Card>
          <EmptyState message={t("noStaff")} />
        </Card>
      ) : (
        timeGrid(
          visibleStaff.map((s) => ({
            key: s.id,
            staffId: s.id,
            date,
            label: (
              <span className="flex items-center gap-1.5 truncate">
                {showStaffColour && <span className="size-2.5 shrink-0 rounded-full" style={{ background: palette[s.id].border }} />}
                {s.name}
              </span>
            ),
          })),
          gridBounds([date]),
        )
      )}
      {shareLine}
    </>
  );
}
