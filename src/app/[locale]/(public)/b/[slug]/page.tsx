import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { db } from "@/lib/db";
import { accentVars } from "@/lib/color";
import { dateKeyInZone } from "@/lib/dates";
import { depositMethods } from "@/lib/appointments/methods";
import { waLink } from "@/lib/appointments/whatsapp-text";
import { BrandFooter } from "@/components/brand-footer";
import { BookingFlow, type FlowService } from "./booking-flow";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const studio = await db.studio.findUnique({ where: { slug } });
  if (!studio) return {};
  return {
    title: `${studio.name} — reservá tu turno`,
    description: `Reservá online en ${studio.name}: elegí servicio, día y horario.`,
  };
}

export default async function BookPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const studio = await db.studio.findUnique({ where: { slug } });
  if (!studio || studio.vertical !== "APPOINTMENTS" || studio.suspendedAt) notFound();
  const t = await getTranslations("bookPublic");

  const [services, addOns, staff] = await Promise.all([
    db.service.findMany({
      where: { studioId: studio.id, isActive: true },
      include: { category: true, staff: true },
      orderBy: [{ category: { position: "asc" } }, { position: "asc" }],
    }),
    db.addOn.findMany({ where: { studioId: studio.id, isActive: true }, orderBy: { name: "asc" } }),
    db.user.findMany({
      where: { studioId: studio.id, isActive: true, role: { in: ["OWNER", "ADMIN", "INSTRUCTOR"] }, workingHours: { some: {} } },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const staffIds = new Set(staff.map((s) => s.id));
  const flowServices: FlowService[] = services
    .map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    category: s.category?.name ?? null,
    durationMin: s.durationMin,
    priceCents: s.priceCents,
    depositType: s.depositType,
    depositValue: s.depositValue,
    staffIds: (s.staff.length ? s.staff.map((x) => x.staffId) : [...staffIds]).filter((id) => staffIds.has(id)),
    addOns: addOns
      .filter((a) => a.serviceId === null || a.serviceId === s.id)
      .map((a) => ({ id: a.id, name: a.name, durationMin: a.durationMin, priceCents: a.priceCents })),
    }))
    // Nobody with hours does it: listing it would only lead to "no times".
    .filter((s) => s.staffIds.length > 0);

  const { mp: canMp, transfer: canTransfer } = depositMethods(studio);
  const contact = waLink(studio.whatsappNumber, t("hello", { studio: studio.name }));

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
            <a href={contact} className="mt-2 inline-block text-sm font-medium text-accent underline-offset-4 hover:underline">
              {t("askOnWhatsapp")}
            </a>
          )}
        </header>

        {flowServices.length === 0 || staff.length === 0 ? (
          <p className="rounded-[var(--radius-lg)] bg-surface p-6 text-center text-sm text-muted shadow-[var(--shadow-soft)]">
            {t("notReady")}
          </p>
        ) : (
          <BookingFlow
            slug={studio.slug}
            services={flowServices}
            staff={staff}
            currency={studio.currency}
            timeZone={studio.timezone}
            today={dateKeyInZone(new Date(), studio.timezone)}
            cancellationCutoffHours={studio.cancellationCutoffHours}
            depositRefundable={studio.depositRefundable}
            methods={{ mp: canMp, transfer: canTransfer }}
          />
        )}
      </main>
      <BrandFooter />
    </div>
  );
}

