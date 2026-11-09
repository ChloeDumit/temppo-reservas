import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { db } from "@/lib/db";
import { accentVars } from "@/lib/color";
import { waLink } from "@/lib/appointments/whatsapp-text";
import { priceRange } from "@/lib/venues/pricing";
import { BrandFooter } from "@/components/brand-footer";
import { RentalFlow, type FlowSpace } from "./rental-flow";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const studio = await db.studio.findUnique({ where: { slug } });
  if (!studio) return {};
  return {
    title: `${studio.name} — reservá tu cancha`,
    description: `Reservá online en ${studio.name}: elegí día, horario y duración.`,
  };
}

export default async function RentPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const studio = await db.studio.findUnique({ where: { slug } });
  if (!studio || studio.vertical !== "VENUES" || studio.suspendedAt) notFound();

  const t = await getTranslations("rentPublic");

  const spaces = await db.space.findMany({
    where: { studioId: studio.id, isActive: true },
    include: { hours: true, bands: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  /*
    A space with no opening hours can never return a time, so listing it would
    only lead someone to an empty grid and a shrug.
  */
  const bookable: FlowSpace[] = spaces
    .filter((s) => s.hours.length > 0 && s.durationsMin.length > 0)
    .map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      durationsMin: s.durationsMin,
      fromCents: priceRange(s).minCents,
    }));

  const contact = waLink(studio.whatsappNumber, t("hello", { studio: studio.name }));

  // Resolved here so the client component carries no translation machinery.
  const copy = {
    kindLabel: t("kindLabel"),
    durationLabel: t("durationLabel"),
    spaceLabel: t("spaceLabel"),
    anySpace: t("anySpace"),
    seeTimes: t("seeTimes"),
    back: t("back"),
    loading: t("loading"),
    noTimes: t("noTimes"),
    name: t("name"),
    phone: t("phone"),
    notes: t("notes"),
    confirm: t("confirm"),
    booking: t("booking"),
    taken: t("taken"),
    generic: t("generic"),
    doneTitle: t("doneTitle"),
    heldTitle: t("heldTitle"),
    /*
      Raw on purpose: the amount is only known once the booking comes back, so
      the flow fills {amount} in the browser. Asking t() for it here would be
      asking next-intl to format a placeholder nothing can supply yet.
    */
    payToHold: t.raw("payToHold"),
    payNow: t("payNow"),
    manageLink: t("manageLink"),
  };

  return (
    <div className="accent-scope flex min-h-dvh flex-col" style={accentVars(studio.accentColor)}>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-16 pt-8 sm:px-5">
        <header className="mb-6 text-center">
          {studio.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={studio.logoUrl} alt={studio.name} className="mx-auto mb-3 h-16 object-contain" />
          ) : null}
          <h1 className="text-[28px] leading-tight">{studio.name}</h1>
          <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
          {contact && (
            <a
              href={contact}
              className="mt-2 inline-block text-sm font-medium text-accent underline-offset-4 hover:underline"
            >
              {t("askOnWhatsapp")}
            </a>
          )}
        </header>

        {bookable.length === 0 ? (
          <p className="rounded-[var(--radius-lg)] bg-surface p-6 text-center text-sm text-muted shadow-[var(--shadow-soft)]">
            {t("notReady")}
          </p>
        ) : (
          <RentalFlow
            slug={studio.slug}
            spaces={bookable}
            currency={studio.currency}
            locale={locale}
            copy={copy}
          />
        )}
      </main>
      <BrandFooter />
    </div>
  );
}
