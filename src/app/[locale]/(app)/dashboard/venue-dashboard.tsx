import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { dayAgenda, venueSummary } from "@/lib/venues/agenda-data";
import { dateKeyInZone, minutesIntoDayInZone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, PageHeader, SectionLabel } from "@/components/ui/page-header";
import { Icon } from "@/components/app/icon";

/**
 * A club's home: how today is selling, what is coming in the next hours, and
 * — while the club is still being set up — what is missing before the booking
 * page can show a single time.
 */
export async function VenueDashboard({ user, locale }: { user: SessionUser; locale: string }) {
  const studio = user.studio;
  const t = await getTranslations("venueHome");
  const tr = await getTranslations("rentals");

  const now = new Date();
  const today = dateKeyInZone(now, studio.timezone);

  const [agenda, summary, spaceCount] = await Promise.all([
    dayAgenda(studio, today),
    venueSummary(studio, now),
    db.space.count({ where: { studioId: studio.id, isActive: true } }),
  ]);

  const money = (cents: number) => formatMoney(cents, studio.currency, locale);
  const clock = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: studio.timezone,
  });

  const nowMin = minutesIntoDayInZone(now, studio.timezone);

  /*
    How full the club is right now, counted in courts rather than bookings:
    "dos de cinco ocupadas" is the number someone behind the counter actually
    uses, and it is the one a glance at the grid would otherwise have to count.
  */
  const busyNow = new Set(
    agenda.rentals
      .filter(
        (r) =>
          r.status === "CONFIRMED" &&
          minutesIntoDayInZone(r.startsAt, studio.timezone) <= nowMin &&
          minutesIntoDayInZone(r.endsAt, studio.timezone) > nowMin,
      )
      .map((r) => r.spaceId),
  ).size;

  const todayLabel = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: studio.timezone,
  }).format(now);

  if (spaceCount === 0) {
    return (
      <>
        <PageHeader title={t("welcome", { name: user.name })} description={t("setupHint")} />
        <Card>
          <EmptyState message={t("noSpaces")} />
          <div className="pb-5 text-center">
            <Link href="/spaces" className={buttonClass("primary", "md")}>
              {t("addSpaces")}
            </Link>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("welcome", { name: user.name })} description={todayLabel} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-[11px] uppercase tracking-wider text-muted">{t("busyNow")}</p>
            <p className="mt-1 font-display text-2xl tabular-nums text-ink">
              {busyNow}/{spaceCount}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-[11px] uppercase tracking-wider text-muted">{t("bookedToday")}</p>
            <p className="mt-1 font-display text-2xl tabular-nums text-ink">
              {money(agenda.takenCents)}
            </p>
          </CardBody>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardBody>
            <p className="text-[11px] uppercase tracking-wider text-muted">{t("next24")}</p>
            <p className="mt-1 font-display text-2xl tabular-nums text-ink">{summary.todayCount}</p>
          </CardBody>
        </Card>
      </div>

      <div className="mb-6">
        <Link href="/rentals" className={buttonClass("primary", "md")}>
          <Icon name="calendar" className="size-4" />
          {t("openAgenda")}
        </Link>
      </div>

      <SectionLabel>{t("coming")}</SectionLabel>
      {summary.upcoming.length === 0 ? (
        <Card>
          <EmptyState message={t("nothingComing")} />
        </Card>
      ) : (
        <div className="space-y-2">
          {summary.upcoming.map((rental) => (
            <Card key={rental.id}>
              <CardBody className="flex items-center gap-3 py-3">
                <span className="font-display text-lg tabular-nums text-ink">
                  {clock.format(rental.startsAt)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-ink">{rental.contactName}</span>
                  <span className="block truncate text-xs text-muted">
                    {rental.space.name}
                    {rental.source === "ONLINE" ? ` · ${tr("sourceOnline")}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-sm tabular-nums text-ink-soft">
                  {money(rental.priceCents)}
                </span>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
