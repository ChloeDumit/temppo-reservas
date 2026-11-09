import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireVenueStaff } from "@/lib/venues/guards";
import { dayAgenda } from "@/lib/venues/agenda-data";
import { dateKeyInZone, minutesIntoDayInZone } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { Icon } from "@/components/app/icon";
import { RentalsClient } from "./rentals-client";
import type { GridBlock, GridRental } from "./rental-grid";

/** "YYYY-MM-DD" plus n days, as calendar arithmetic with no zone involved. */
function shiftDay(dateKey: string, n: number) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export default async function RentalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireVenueStaff();
  const studio = user.studio;
  const t = await getTranslations("rentals");

  const { date } = await searchParams;
  const today = dateKeyInZone(new Date(), studio.timezone);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date ?? "") ? date! : today;

  const agenda = await dayAgenda(studio, day);

  const money = (cents: number) => formatMoney(cents, studio.currency, locale);
  const timeOf = (at: Date) => minutesIntoDayInZone(at, studio.timezone);
  const clock = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: studio.timezone,
  });

  /*
    Minutes are resolved here, in the studio's zone, because the browser's zone
    is not the club's — a grid laid out from the visitor's clock would put an
    eight o'clock booking in the wrong row for anyone travelling.
  */
  const rentals: GridRental[] = agenda.rentals.map((r) => ({
    id: r.id,
    spaceId: r.spaceId,
    contactName: r.contactName,
    contactPhone: r.contactPhone,
    fromMin: timeOf(r.startsAt),
    toMin: timeOf(r.endsAt),
    label: `${clock.format(r.startsAt)}–${clock.format(r.endsAt)}`,
    priceCents: r.priceCents,
    status: r.status,
    source: r.source,
    notes: r.notes,
  }));

  const blocks: GridBlock[] = agenda.blocks.map((b) => ({
    id: b.id,
    spaceId: b.spaceId,
    fromMin: timeOf(b.startsAt),
    toMin: timeOf(b.endsAt),
    reason: b.reason,
  }));

  const dayLabel = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));

  const copy = {
    newRental: t("newRental"),
    duration: t("duration"),
    name: t("name"),
    phone: t("phone"),
    notes: t("notes"),
    force: t("force"),
    confirm: t("confirm"),
    taken: t("taken"),
    badDuration: t("badDuration"),
    generic: t("generic"),
    bookAt: t("bookAt"),
    blocked: t("blocked"),
    blockButton: t("blockButton"),
    blockTitle: t("blockTitle"),
    blockConfirm: t("blockConfirm"),
    allCourts: t("allCourts"),
    court: t("court"),
    from: t("from"),
    to: t("to"),
    reason: t("reason"),
    reasonHint: t("reasonHint"),
    cancel: t("cancel"),
    noShow: t("noShow"),
    wasNoShow: t("wasNoShow"),
    awaitingPayment: t("awaitingPayment"),
    sourceOnline: t("sourceOnline"),
    sourceCounter: t("sourceCounter"),
  };

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("takenToday", { amount: money(agenda.takenCents) })}
      />

      {/* Day at a time: a club works a day, not a week. */}
      <div className="mb-5 flex items-center gap-2">
        <Link
          href={`/rentals?date=${shiftDay(day, -1)}`}
          aria-label={t("previous")}
          className={buttonClass("secondary", "sm")}
        >
          <Icon name="chevronLeft" className="size-4" />
        </Link>
        <span className="flex-1 text-center text-sm font-medium capitalize text-ink">
          {dayLabel}
        </span>
        <Link
          href={`/rentals?date=${shiftDay(day, 1)}`}
          aria-label={t("next")}
          className={buttonClass("secondary", "sm")}
        >
          <Icon name="chevronRight" className="size-4" />
        </Link>
        {day !== today && (
          <Link href="/rentals" className={buttonClass("ghost", "sm")}>
            {t("today")}
          </Link>
        )}
      </div>

      {agenda.spaces.length === 0 ? (
        <Card>
          <EmptyState message={t("noSpaces")} />
          <div className="pb-5 text-center">
            <Link href="/spaces" className={buttonClass("primary", "md")}>
              {t("addSpaces")}
            </Link>
          </div>
        </Card>
      ) : (
        <RentalsClient
          date={day}
          spaces={agenda.spaces.map((s) => ({
            id: s.id,
            name: s.name,
            kind: s.kind,
            openMin: s.openMin,
            closeMin: s.closeMin,
            durationsMin: s.durationsMin,
          }))}
          rentals={rentals}
          blocks={blocks}
          fromMin={agenda.fromMin}
          toMin={agenda.toMin}
          currency={studio.currency}
          locale={locale}
          copy={copy}
        />
      )}
    </>
  );
}
