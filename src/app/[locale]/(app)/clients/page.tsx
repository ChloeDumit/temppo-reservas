import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requireAppointmentStaff } from "@/lib/appointments/guards";
import { formatDate } from "@/lib/dates";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/field";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { SheetForm } from "@/components/app/sheet-form";
import { NewClientForm } from "./new-client-form";

export default async function ClientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { q = "" } = await searchParams;

  const user = await requireAppointmentStaff();
  const studio = user.studio;
  const t = await getTranslations("clients");
  const query = q.trim();
  const digits = query.replace(/\D/g, "");
  const now = new Date();

  const clients = await db.studentProfile.findMany({
    where: {
      user: {
        studioId: studio.id,
        role: "STUDENT",
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                ...(digits.length >= 3 ? [{ phone: { contains: digits.slice(-6) } }] : []),
                { email: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      },
    },
    include: {
      user: { select: { name: true, phone: true } },
      appointments: {
        where: { status: { in: ["CONFIRMED", "PENDING_PAYMENT"] }, startsAt: { gt: now } },
        orderBy: { startsAt: "asc" },
        take: 1,
        select: { startsAt: true },
      },
    },
    orderBy: [{ lastVisitAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 200,
  });

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        action={
          <SheetForm label={t("new")} title={t("new")}>
            <NewClientForm />
          </SheetForm>
        }
      />
      <form className="mb-4">
        <Input name="q" defaultValue={query} placeholder={t("search")} type="search" />
      </form>
      {clients.length === 0 ? (
        <Card>
          <EmptyState message={query ? t("noMatches") : t("empty")} />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {clients.map((c) => (
              <li key={c.id}>
                <Link href={`/clients/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-sunken">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium text-ink">
                      <span className="truncate">{c.user.name}</span>
                      {c.allergies && <Badge tone="critical">{t("allergyBadge")}</Badge>}
                      {c.bookingBlocked && <Badge tone="caution">{t("blocked")}</Badge>}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {c.user.phone ?? "—"}
                      {c.lastVisitAt && ` · ${t("lastVisit", { date: formatDate(c.lastVisitAt, studio.timezone, locale) })}`}
                    </span>
                  </span>
                  {c.appointments[0] && (
                    <span className="shrink-0 text-xs text-accent">
                      {t("next", { date: formatDate(c.appointments[0].startsAt, studio.timezone, locale) })}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
