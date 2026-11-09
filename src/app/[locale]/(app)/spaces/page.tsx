import { getTranslations, setRequestLocale } from "next-intl/server";
import { db } from "@/lib/db";
import { requireVenueAdmin, hhmm } from "@/lib/venues/guards";
import { priceRange } from "@/lib/venues/pricing";
import { formatMoney } from "@/lib/money";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, SectionLabel } from "@/components/ui/page-header";
import { SheetForm } from "@/components/app/sheet-form";
import { Icon } from "@/components/app/icon";
import { SpaceForm, BandForm, type SpaceValues } from "./space-form";
import { toggleSpaceAction, removeBandAction } from "./actions";

/** Sunday-first labels to match JS getDay(). */
function weekdayLabels(locale: string) {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  // 2024-01-07 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2024, 0, 7 + i))));
}

const BLANK: SpaceValues = {
  name: "",
  kind: "",
  capacity: "",
  pricePerHour: "",
  durations: "60, 90",
  bufferAfterMin: 0,
  depositType: "NONE",
  depositValue: "",
  weekdays: [1, 2, 3, 4, 5, 6, 0],
  openFrom: "08:00",
  openTo: "23:00",
};

export default async function SpacesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireVenueAdmin();
  const studio = user.studio;
  const t = await getTranslations("spaces");
  const tc = await getTranslations("common");

  const spaces = await db.space.findMany({
    where: { studioId: studio.id },
    include: { hours: true, bands: true },
    orderBy: [{ isActive: "desc" }, { position: "asc" }, { createdAt: "asc" }],
  });

  const labels = weekdayLabels(locale);
  const money = (cents: number) => formatMoney(cents, studio.currency, locale);
  const perHour = (cents: number) => `${money(cents)} ${t("perHour")}`;

  const copy = {
    name: t("name"),
    kind: t("kind"),
    kindHint: t("kindHint"),
    kindPlaceholder: t("kindPlaceholder"),
    pricePerHour: t("priceLabel"),
    capacity: t("capacity"),
    capacityHint: t("capacityHint"),
    durations: t("durations"),
    durationsHint: t("durationsHint"),
    buffer: t("buffer"),
    bufferHint: t("bufferHint"),
    days: t("days"),
    opensAt: t("opensAt"),
    closesAt: t("closesAt"),
    save: tc("save"),
    generic: t("generic"),
    badDurations: t("badDurations"),
    badPrice: t("badPrice"),
    badHours: t("badHours"),
    noDays: t("noDays"),
    bandLabel: t("bandLabel"),
    bandLabelHint: t("bandLabelHint"),
    bandPlaceholder: t("bandPlaceholder"),
    deposit: t("deposit"),
    depositHint: t("depositHint"),
    depositNone: t("depositNone"),
    depositPercent: t("depositPercent"),
    depositFixed: t("depositFixed"),
    depositValue: t("depositValue"),
    badDeposit: t("badDeposit"),
    from: t("from"),
    to: t("to"),
  };

  /** One line of opening hours: the days, then the span they share. */
  const hoursLine = (hours: { weekday: number; startMin: number; endMin: number }[]) => {
    if (hours.length === 0) return t("noHours");
    const days = [...hours]
      .sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7))
      .map((h) => labels[h.weekday])
      .join(" · ");
    const from = Math.min(...hours.map((h) => h.startMin));
    const to = Math.max(...hours.map((h) => h.endMin));
    return `${days} · ${hhmm(from)}–${hhmm(to)}`;
  };

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        action={
          <SheetForm label={t("newSpace")} title={t("newSpace")}>
            <SpaceForm values={BLANK} weekdayLabels={labels} copy={copy} />
          </SheetForm>
        }
      />

      {spaces.length === 0 ? (
        <Card>
          <EmptyState message={t("empty")} />
        </Card>
      ) : (
        <div className="space-y-3">
          {spaces.map((space) => {
            const range = priceRange({
              priceCentsPerHour: space.priceCentsPerHour,
              bands: space.bands,
            });

            return (
              <Card key={space.id}>
                <CardBody className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-1.5 h-8 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: space.colorHex ?? "var(--color-accent)" }}
                      aria-hidden
                    />

                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[15px] font-medium text-ink">{space.name}</span>
                        {space.kind && <Badge>{space.kind}</Badge>}
                        {!space.isActive && <Badge tone="caution">{tc("inactive")}</Badge>}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">{hoursLine(space.hours)}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {range.minCents === range.maxCents
                          ? perHour(range.minCents)
                          : t("fromTo", { min: money(range.minCents), max: money(range.maxCents) })}
                        {" · "}
                        {space.durationsMin.join(" / ")} min
                        {space.bufferAfterMin > 0 && ` · ${t("bufferShort", { min: space.bufferAfterMin })}`}
                        {space.depositType !== "NONE" &&
                          ` · ${t("depositShort", {
                            amount:
                              space.depositType === "PERCENT"
                                ? `${space.depositValue}%`
                                : money(space.depositValue),
                          })}`}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <SheetForm
                        label={tc("edit")}
                        title={space.name}
                        variant="secondary"
                        icon={null}
                      >
                        <SpaceForm
                          values={{
                            id: space.id,
                            name: space.name,
                            kind: space.kind ?? "",
                            capacity: space.capacity ? String(space.capacity) : "",
                            pricePerHour: String(space.priceCentsPerHour / 100),
                            durations: space.durationsMin.join(", "),
                            bufferAfterMin: space.bufferAfterMin,
                            depositType: space.depositType,
                            // Percent is a plain number; a fixed seña is money.
                            depositValue:
                              space.depositType === "NONE"
                                ? ""
                                : space.depositType === "PERCENT"
                                  ? String(space.depositValue)
                                  : String(space.depositValue / 100),
                            weekdays: [...new Set(space.hours.map((h) => h.weekday))],
                            openFrom: hhmm(
                              space.hours.length ? Math.min(...space.hours.map((h) => h.startMin)) : 8 * 60,
                            ),
                            openTo: hhmm(
                              space.hours.length ? Math.max(...space.hours.map((h) => h.endMin)) : 23 * 60,
                            ),
                          }}
                          weekdayLabels={labels}
                          copy={copy}
                        />
                      </SheetForm>

                      <form action={toggleSpaceAction}>
                        <input type="hidden" name="id" value={space.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          aria-label={space.isActive ? t("deactivate") : t("activate")}
                          title={space.isActive ? t("deactivate") : t("activate")}
                        >
                          <Icon name={space.isActive ? "x" : "check"} className="size-4" />
                        </Button>
                      </form>
                    </div>
                  </div>

                  {/* Peak rates, which is where a club makes its margin. */}
                  <div className="rounded-[var(--radius-md)] bg-sunken/60 p-3">
                    <SectionLabel>{t("bands")}</SectionLabel>
                    {space.bands.length === 0 ? (
                      <p className="text-xs text-muted">{t("noBands")}</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {space.bands.map((band) => (
                          <li key={band.id} className="flex items-center justify-between gap-2 text-sm">
                            <span className="min-w-0 truncate text-ink-soft">
                              {band.label ? `${band.label} · ` : ""}
                              {[...band.weekdays]
                                .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
                                .map((d) => labels[d])
                                .join(" ")}{" "}
                              {hhmm(band.startMin)}–{hhmm(band.endMin)}
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                              <span className="text-sm font-medium tabular-nums text-ink">
                                {perHour(band.priceCentsPerHour)}
                              </span>
                              <form action={removeBandAction}>
                                <input type="hidden" name="id" value={band.id} />
                                <Button type="submit" variant="ghost" size="sm" aria-label={tc("delete")}>
                                  <Icon name="x" className="size-3.5" />
                                </Button>
                              </form>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="mt-2">
                      <SheetForm
                        label={t("addBand")}
                        title={`${space.name} · ${t("addBand")}`}
                        variant="secondary"
                        className="w-full sm:w-auto"
                      >
                        <BandForm spaceId={space.id} weekdayLabels={labels} copy={copy} />
                      </SheetForm>
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
