import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { ADMIN_ROLES } from "@/lib/auth/guards";
import { requireAppointmentStaff } from "@/lib/appointments/guards";
import { addDays, dateKeyInZone, formatTime, inZone, startOfWeekInZone, wallTimeToUtc } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { appUrlFor } from "@/lib/brand/url";
import { localePath } from "@/i18n/routing";
import { shiftDateKey } from "@/lib/appointments/slots";
import { reminderText, waLink } from "@/lib/appointments/whatsapp-text";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { SheetForm } from "@/components/app/sheet-form";
import { AppointmentSheet, STATUS_TONE, type AgendaAppointment } from "./appointment-sheet";
import { NewAppointmentForm } from "./new-appointment-form";

const PX_PER_MIN = 1.1;
const HIDDEN = ["CANCELLED", "LATE_CANCELLED", "EXPIRED"];

function minutesOf(date: Date, tz: string) {
  const z = inZone(date, tz);
  return z.getHours() * 60 + z.getMinutes();
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
  const view = query.view === "week" ? "week" : "day";

  // A professional sees her own column; whoever runs the place sees everyone.
  const allStaff = await db.user.findMany({
    where: { studioId: studio.id, isActive: true, role: { in: ["OWNER", "ADMIN", "INSTRUCTOR"] } },
    select: { id: true, name: true, role: true, _count: { select: { workingHours: true, staffAppointments: true } } },
    orderBy: { createdAt: "asc" },
  });
  const working = allStaff.filter((s) => s._count.workingHours > 0 || s._count.staffAppointments > 0);
  const visibleStaff = (isAdmin ? working : working.filter((s) => s.id === user.id)).filter(
    (s) => !query.staff || s.id === query.staff,
  );
  const staffIds = visibleStaff.map((s) => s.id);

  const rangeStart = view === "week" ? startOfWeekInZone(wallTimeToUtc(date, "12:00", tz), tz) : wallTimeToUtc(date, "00:00", tz);
  const rangeDays = view === "week" ? 7 : 1;
  const firstKey = dateKeyInZone(rangeStart, tz);
  const rangeEnd = wallTimeToUtc(shiftDateKey(firstKey, rangeDays), "00:00", tz);

  const [appointments, blocks, hours, services, clients] = await Promise.all([
    db.appointment.findMany({
      where: { studioId: studio.id, staffId: { in: staffIds }, startsAt: { gte: rangeStart, lt: rangeEnd } },
      include: { client: { include: { user: true } }, addOns: true, staff: { select: { name: true } } },
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
    db.service.findMany({
      where: { studioId: studio.id, isActive: true },
      include: { staff: true, addOns: { where: { isActive: true } } },
      orderBy: { position: "asc" },
    }),
    db.studentProfile.findMany({
      where: { user: { studioId: studio.id, role: "STUDENT", isActive: true } },
      include: { user: { select: { name: true, phone: true } } },
      orderBy: { updatedAt: "desc" },
      take: 500,
    }),
  ]);
  const globalAddOns = await db.addOn.findMany({ where: { studioId: studio.id, isActive: true, serviceId: null } });

  const money = (cents: number) => formatMoney(cents, studio.currency, locale);
  const base = appUrlFor(studio);
  const bookingUrl = `${base}${localePath(studio.locale, `/b/${studio.slug}`)}`;

  const toView = (a: (typeof appointments)[number]): AgendaAppointment => {
    const client = a.client.user;
    return {
      id: a.id,
      status: a.status,
      serviceName: a.serviceName,
      addOns: a.addOns.map((x) => x.name),
      timeLabel: `${formatTime(a.startsAt, tz, locale)}–${formatTime(a.endsAt, tz, locale)}`,
      dateKey: dateKeyInZone(a.startsAt, tz),
      startTime: formatTime(a.startsAt, tz, "es"),
      staffId: a.staffId,
      staffName: a.staff.name,
      clientId: a.clientId,
      clientName: client.name,
      clientPhone: client.phone,
      allergies: a.client.allergies,
      clientNotes: a.clientNotes,
      staffNotes: a.staffNotes,
      price: money(a.priceCents),
      deposit: a.depositCents ? money(a.depositCents) : null,
      depositStatus: a.depositStatus,
      started: a.startsAt <= now,
      // The professional's own WhatsApp, message ready. Free, and how most
      // of them already remind people — just without the typing.
      reminderLink: waLink(client.phone, reminderText(a, studio, client.name)),
      callLink: client.phone ? `tel:${client.phone.replace(/[^\d+]/g, "")}` : null,
    };
  };

  const staffOptions = visibleStaff.map((s) => ({ id: s.id, name: s.name }));
  const allStaffOptions = working.map((s) => ({ id: s.id, name: s.name }));

  // Navigation links keep the view and the staff filter.
  const href = (over: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const next = { date, view, staff: query.staff, ...over };
    for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
    return `/agenda?${params.toString()}`;
  };
  const step = view === "week" ? 7 : 1;
  const titleFmt = new Intl.DateTimeFormat(locale, {
    weekday: view === "day" ? "long" : undefined,
    day: "numeric",
    month: "long",
    timeZone: tz,
  });
  // Sentence case: CSS `capitalize` would turn "de octubre" into "De Octubre".
  const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  const title =
    view === "day"
      ? titleFmt.format(wallTimeToUtc(date, "12:00", tz))
      : `${titleFmt.format(rangeStart)} – ${titleFmt.format(addDays(rangeEnd, -1))}`;

  const newForm = (
    <SheetForm label={t("newAppointment")} title={t("newAppointment")}>
      <NewAppointmentForm
        clients={clients.map((c) => ({ id: c.id, name: c.user.name, phone: c.user.phone }))}
        services={services.map((s) => ({
          id: s.id,
          name: s.name,
          durationMin: s.durationMin,
          staffIds: s.staff.map((x) => x.staffId),
          addOns: [...s.addOns, ...globalAddOns].map((a) => ({ id: a.id, name: a.name })),
        }))}
        staff={allStaffOptions}
        defaultStaffId={staffIds[0] ?? user.id}
        defaultDate={date}
      />
    </SheetForm>
  );

  const nav = (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1">
        <Link href={href({ date: shiftDateKey(date, -step) })} className="rounded-full px-3 py-1.5 text-accent hover:bg-accent-soft" aria-label={t("previous")}>
          ‹
        </Link>
        <Link href={href({ date: today })} className="rounded-full px-3 py-1.5 text-sm font-medium text-ink hover:bg-sunken">
          {t("today")}
        </Link>
        <Link href={href({ date: shiftDateKey(date, step) })} className="rounded-full px-3 py-1.5 text-accent hover:bg-accent-soft" aria-label={t("next")}>
          ›
        </Link>
        <span className="ml-2 text-sm font-medium text-ink">{upperFirst(title)}</span>
      </div>
      <div className="flex items-center gap-1 rounded-full bg-sunken p-1 text-sm">
        {(["day", "week"] as const).map((v) => (
          <Link
            key={v}
            href={href({ view: v })}
            className={cn("rounded-full px-3 py-1", view === v ? "bg-surface font-medium text-ink shadow-[var(--shadow-soft)]" : "text-muted")}
          >
            {t(v)}
          </Link>
        ))}
      </div>
    </div>
  );

  if (services.length === 0) {
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

  const shareLine = (
    <p className="mt-6 text-sm text-muted">
      {t("shareLink")} <span className="select-all font-medium text-ink">{bookingUrl}</span>
    </p>
  );

  if (view === "week") {
    const days = Array.from({ length: 7 }, (_, i) => shiftDateKey(firstKey, i));
    return (
      <>
        <PageHeader title={t("title")} action={newForm} />
        {nav}
        <div className="space-y-4">
          {days.map((key) => {
            const items = appointments.filter((a) => dateKeyInZone(a.startsAt, tz) === key && !HIDDEN.includes(a.status));
            const label = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "short", timeZone: tz }).format(
              wallTimeToUtc(key, "12:00", tz),
            );
            return (
              <section key={key}>
                <Link href={href({ date: key, view: "day" })} className={cn("mb-1.5 block px-1 text-sm font-semibold", key === today ? "text-accent" : "text-ink-soft")}>
                  {upperFirst(label)}
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
                                  {staffOptions.length > 1 ? ` · ${v.staffName}` : ""}
                                </span>
                              </span>
                              {a.status !== "CONFIRMED" && <Badge tone={STATUS_TONE[a.status]}>{t(`status${a.status}` as "statusCONFIRMED")}</Badge>}
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

  // Day view: a column per professional, time running down.
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const dayHours = hours.filter((h) => h.weekday === weekday);
  const visible = appointments.filter((a) => !HIDDEN.includes(a.status));
  const starts = [...dayHours.map((h) => h.startMin), ...visible.map((a) => minutesOf(a.startsAt, tz))];
  const ends = [...dayHours.map((h) => h.endMin), ...visible.map((a) => minutesOf(a.endsAt, tz) || 24 * 60)];
  const gridStart = Math.floor((starts.length ? Math.min(...starts) : 9 * 60) / 60) * 60;
  const gridEnd = Math.min(24 * 60, Math.ceil((ends.length ? Math.max(...ends) : 19 * 60) / 60) * 60);
  const height = (gridEnd - gridStart) * PX_PER_MIN;
  const hourMarks = Array.from({ length: (gridEnd - gridStart) / 60 + 1 }, (_, i) => gridStart + i * 60);
  const dayStart = wallTimeToUtc(date, "00:00", tz);
  const nowMin = date === today ? minutesOf(now, tz) : null;
  const pos = (min: number) => (Math.min(Math.max(min, gridStart), gridEnd) - gridStart) * PX_PER_MIN;

  return (
    <>
      <PageHeader title={t("title")} action={newForm} />
      {nav}
      {visibleStaff.length === 0 ? (
        <Card>
          <EmptyState message={t("noStaff")} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <div className="flex min-w-full" style={{ width: `max(100%, ${3.5 + visibleStaff.length * 11}rem)` }}>
              {/* Hour labels */}
              <div className="sticky left-0 z-10 w-14 shrink-0 border-r border-line bg-surface">
                <div className="h-10 border-b border-line" />
                <div className="relative" style={{ height }}>
                  {hourMarks.map((m) => (
                    <span key={m} className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-muted" style={{ top: pos(m) }}>
                      {String(m / 60).padStart(2, "0")}:00
                    </span>
                  ))}
                </div>
              </div>

              {visibleStaff.map((s) => {
                const shifts = dayHours.filter((h) => h.staffId === s.id);
                const mine = visible.filter((a) => a.staffId === s.id);
                const myBlocks = blocks.filter((b) => b.staffId === null || b.staffId === s.id);
                return (
                  <div key={s.id} className="min-w-[11rem] flex-1 border-r border-line last:border-r-0">
                    <div className="flex h-10 items-center justify-center border-b border-line px-2 text-sm font-medium text-ink">
                      <Link href={href({ staff: query.staff ? undefined : s.id })} className="truncate hover:text-accent">
                        {s.name}
                      </Link>
                    </div>
                    <div className="relative bg-sunken/60" style={{ height }}>
                      {/* Working time is the light ground; outside it stays shaded. */}
                      {shifts.map((h) => (
                        <div key={h.id} className="absolute inset-x-0 bg-surface" style={{ top: pos(h.startMin), height: pos(h.endMin) - pos(h.startMin) }} />
                      ))}
                      {hourMarks.map((m) => (
                        <div key={m} className="absolute inset-x-0 border-t border-line/70" style={{ top: pos(m) }} />
                      ))}
                      {myBlocks.map((b) => {
                        const from = b.startsAt < dayStart ? gridStart : minutesOf(b.startsAt, tz);
                        const to = b.endsAt >= addDays(dayStart, 1) ? gridEnd : minutesOf(b.endsAt, tz);
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
                      {mine.map((a) => {
                        const v = toView(a);
                        const top = pos(minutesOf(a.startsAt, tz));
                        const h = Math.max(pos(minutesOf(a.endsAt, tz) || 24 * 60) - top, 26);
                        return (
                          <AppointmentSheet
                            key={a.id}
                            appt={v}
                            staff={allStaffOptions}
                            className={cn(
                              "absolute inset-x-1 overflow-hidden rounded-md border-l-[3px] px-2 py-1 text-left shadow-[var(--shadow-soft)] transition-transform hover:z-10 hover:scale-[1.01]",
                              a.status === "PENDING_PAYMENT"
                                ? "border-caution bg-caution-soft"
                                : a.status === "NO_SHOW"
                                  ? "border-critical bg-critical-soft"
                                  : a.status === "COMPLETED"
                                    ? "border-positive bg-positive-soft"
                                    : "border-accent bg-accent-soft",
                            )}
                            style={{ top, height: h }}
                          >
                            <span className="block truncate text-[12px] font-semibold text-ink">{v.clientName}</span>
                            <span className="block truncate text-[11px] text-ink-soft">
                              {formatTime(a.startsAt, tz, locale)} · {v.serviceName}
                            </span>
                          </AppointmentSheet>
                        );
                      })}
                      {nowMin !== null && nowMin >= gridStart && nowMin <= gridEnd && (
                        <div className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-critical" style={{ top: pos(nowMin) }} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}
      {shareLine}
    </>
  );
}
