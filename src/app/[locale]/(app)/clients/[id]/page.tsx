import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { ADMIN_ROLES } from "@/lib/auth/guards";
import { requireAppointmentStaff } from "@/lib/appointments/guards";
import { dateKeyInZone, formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { appUrlFor } from "@/lib/brand/url";
import { localePath } from "@/i18n/routing";
import { rebookText, waLink } from "@/lib/appointments/whatsapp-text";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Stat } from "@/components/ui/stat";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { STATUS_TONE } from "../../agenda/appointment-sheet";
import { ClientForm } from "./client-form";
import { unblockClientAction } from "../actions";

export default async function ClientPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await requireAppointmentStaff();
  const studio = user.studio;
  const t = await getTranslations("clients");
  const ta = await getTranslations("agenda");

  const client = await db.studentProfile.findFirst({
    where: { id, user: { studioId: studio.id } },
    include: {
      user: true,
      appointments: {
        orderBy: { startsAt: "desc" },
        take: 100,
        include: { staff: { select: { name: true } }, addOns: true },
      },
    },
  });
  if (!client) notFound();

  const money = (cents: number) => formatMoney(cents, studio.currency, locale);
  const now = new Date();
  const done = client.appointments.filter((a) => a.status === "COMPLETED");
  const spent = done.reduce((sum, a) => sum + a.priceCents, 0);
  const upcoming = client.appointments.filter((a) => a.startsAt > now && (a.status === "CONFIRMED" || a.status === "PENDING_PAYMENT"));
  const bookingUrl = `${appUrlFor(studio)}${localePath(studio.locale, `/b/${studio.slug}`)}`;
  const lastService = done[0]?.serviceName;
  const invite = lastService ? waLink(client.user.phone, rebookText(lastService, studio, client.user.name, bookingUrl)) : null;
  const chat = waLink(client.user.phone, `Hola ${client.user.name.split(" ")[0]}!`);

  return (
    <>
      <PageHeader
        title={client.user.name}
        description={client.user.phone ?? undefined}
        action={
          <div className="flex flex-wrap gap-2">
            {chat && (
              <ButtonLink href={chat} size="sm" variant="secondary">
                WhatsApp
              </ButtonLink>
            )}
            {invite && upcoming.length === 0 && (
              <ButtonLink href={invite} size="sm">
                {t("inviteBack")}
              </ButtonLink>
            )}
          </div>
        }
      />

      {client.allergies && (
        <p className="mb-4 rounded-[var(--radius-md)] bg-critical-soft px-4 py-3 text-sm text-critical">
          <strong>{t("allergies")}:</strong> {client.allergies}
        </p>
      )}

      {client.bookingBlocked && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] bg-caution-soft px-4 py-3 text-sm text-caution">
          <span>{t("blockedExplain", { count: client.noShowCount })}</span>
          {ADMIN_ROLES.includes(user.role) && (
            <form action={unblockClientAction}>
              <input type="hidden" name="id" value={client.id} />
              <Button type="submit" size="sm" variant="secondary">
                {t("unblock")}
              </Button>
            </form>
          )}
        </div>
      )}

      {/* Money gets its own row on a phone: three columns cut "2.400 UYU" short. */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label={t("visits")} value={String(done.length)} />
        <Stat label={t("noShows")} value={String(client.noShowCount)} tone={client.noShowCount ? "critical" : undefined} />
        <div className="col-span-2 sm:order-first sm:col-span-1">
          <Stat label={t("spent")} value={money(spent)} />
        </div>
      </div>

      <Card className="mb-5">
        <CardHeader title={t("file")} />
        <CardBody>
          <ClientForm
            values={{
              id: client.id,
              name: client.user.name,
              phone: client.user.phone ?? "",
              email: client.user.email ?? "",
              allergies: client.allergies ?? "",
              notes: client.notes ?? "",
            }}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("history")} />
        {client.appointments.length === 0 ? (
          <EmptyState message={t("noHistory")} />
        ) : (
          <ul className="divide-y divide-line">
            {client.appointments.map((a) => (
              <li key={a.id} className="space-y-1 px-4 py-3 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {a.serviceName}
                      {a.addOns.length > 0 && <span className="font-normal text-muted"> + {a.addOns.map((x) => x.name).join(", ")}</span>}
                    </p>
                    <p className="text-xs text-muted">
                      <Link href={`/agenda?date=${dateKeyInZone(a.startsAt, studio.timezone)}`} className="hover:text-accent">
                        {formatDateTime(a.startsAt, studio.timezone, locale)}
                      </Link>{" "}
                      · {a.staff.name} · {money(a.priceCents)}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[a.status]}>{ta(`status${a.status}` as "statusCONFIRMED")}</Badge>
                </div>
                {a.staffNotes && <p className="text-sm text-ink-soft">{a.staffNotes}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
