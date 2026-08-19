import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { db } from "@/lib/db";
import { ensureInstances } from "@/lib/classes";
import { addDays, formatDateTime } from "@/lib/dates";
import { accentVars } from "@/lib/color";
import { Brand } from "@/components/brand";
import { LeadForm } from "./lead-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const studio = await db.studio.findUnique({ where: { slug } });
  if (!studio) return { title: "TEMPPO Reservas" };
  return {
    title: `${studio.name} — clase de prueba`,
    description: `Reservá tu clase de prueba gratis en ${studio.name}.`,
  };
}

export default async function TrialPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ utm_source?: string; source?: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const query = await searchParams;

  const studio = await db.studio.findUnique({ where: { slug } });
  if (!studio) notFound();

  const t = await getTranslations("trial");
  await ensureInstances(studio);

  const now = new Date();
  const upcoming = await db.classInstance.findMany({
    where: {
      studioId: studio.id,
      status: "SCHEDULED",
      allowTrialBooking: true,
      startsAt: { gt: now, lte: addDays(now, 14) },
    },
    orderBy: { startsAt: "asc" },
    take: 30,
    include: {
      _count: { select: { bookings: { where: { status: { in: ["BOOKED", "ATTENDED"] } } } } },
    },
  });

  // Only offer times that still have room.
  const options = upcoming
    .filter((klass) => klass._count.bookings < klass.capacity)
    .map((klass) => ({
      id: klass.id,
      label: `${formatDateTime(klass.startsAt, studio.timezone, locale)} · ${klass.name}`,
    }));

  return (
    <div
      className="accent-scope flex min-h-dvh flex-col"
      style={accentVars(studio.accentColor)}
    >
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-10">
        <header className="mb-8 text-center">
          {studio.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={studio.logoUrl}
              alt={studio.name}
              className="mx-auto mb-3 h-14 object-contain"
            />
          ) : null}
          <p className="text-sm font-medium uppercase tracking-widest text-accent">
            {studio.name}
          </p>
          <h1 className="mt-2 text-3xl">{t("title")}</h1>
          <p className="mt-2 text-sm text-muted">{t("subtitle")}</p>
          {options.length === 0 && (
            <p className="mt-3 text-sm text-muted">{t("noClasses")}</p>
          )}
        </header>

        <LeadForm
          slug={studio.slug}
          classes={options}
          source={query.utm_source ?? query.source}
        />
      </main>

      <footer className="flex items-center justify-center gap-2 pb-8 text-xs text-muted">
        {t("poweredBy")} <Brand subdued className="text-xs" />
      </footer>
    </div>
  );
}
