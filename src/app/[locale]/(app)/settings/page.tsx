import { getTranslations, setRequestLocale } from "next-intl/server";
import { inSupportVisit, requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { InviteForm, LocationForm, RulesForm, StudioForm } from "./settings-forms";
import { PushToggle } from "@/components/app/push-toggle";
import { MercadoPagoCard } from "./mercadopago-card";
import { isMercadoPagoOAuthConfigured } from "@/lib/payments/mercadopago-oauth";

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ mp?: string }>;
}) {
  const { locale } = await params;
  const { mp: mpOutcome } = await searchParams;
  setRequestLocale(locale);

  const user = await requireAdmin();
  const studio = user.studio;
  // An appointment business has no classes, fixed spots or teachers on pay.
  const beauty = studio.vertical === "APPOINTMENTS";
  const t = await getTranslations("settings");
  const tc = await getTranslations("common");
  const tpush = await getTranslations("push");

  const [locations, team] = await Promise.all([
    db.location.findMany({ where: { studioId: studio.id }, orderBy: { createdAt: "asc" } }),
    db.user.findMany({
      where: { studioId: studio.id, role: { in: ["OWNER", "ADMIN", "INSTRUCTOR"] } },
      include: { instructorProfile: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
  ]);

  return (
    <>
      <PageHeader title={t("title")} />

      <div className="space-y-4">
        <Card id="studio">
          <CardHeader title={t(beauty ? "studioBeauty" : "studio")} />
          <CardBody>
            <StudioForm
              beauty={beauty}
              values={{
                name: studio.name,
                timezone: studio.timezone,
                currency: studio.currency,
                locale: studio.locale,
                accentColor: studio.accentColor,
                logoUrl: studio.logoUrl ?? "",
                whatsappNumber: studio.whatsappNumber ?? "",
              }}
            />
          </CardBody>
        </Card>

        {/* Connecting is the owner's to do, signed in to her own Mercado Pago. */}
        {studio.vertical === "APPOINTMENTS" && isMercadoPagoOAuthConfigured() && !(await inSupportVisit()) && (
          <MercadoPagoCard studioId={studio.id} outcome={mpOutcome} />
        )}

        <Card>
          <CardHeader title={tpush("title")} />
          <CardBody className="space-y-2">
            <p className="text-xs text-muted">{tpush(beauty ? "hintBeauty" : "hint")}</p>
            <PushToggle publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />
          </CardBody>
        </Card>

        {/* Class rules — waitlist, fixed-spot changes, no-show limits. An
            appointment business sets its booking rules in Horarios instead. */}
        {!beauty && (
          <Card id="rules">
            <CardHeader title={t("rules")} />
            <CardBody>
              <RulesForm
                values={{
                  cancellationCutoffHours: studio.cancellationCutoffHours,
                  reminderHoursBefore: studio.reminderHoursBefore,
                  waitlistClaimWindowMins: studio.waitlistClaimWindowMins,
                  noShowLimit: studio.noShowLimit,
                  monthlyChangesAllowed: studio.monthlyChangesAllowed,
                  bookingOpensDaysAhead: studio.bookingOpensDaysAhead,
                }}
              />
            </CardBody>
          </Card>
        )}

        <Card id="locations">
          <CardHeader title={t("locations")} />
          <CardBody className="space-y-4">
            <ul className="divide-y divide-line">
              {locations.map((location) => (
                <li key={location.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{location.name}</p>
                    {location.address && (
                      <p className="text-xs text-muted">{location.address}</p>
                    )}
                  </div>
                  {!location.isActive && <Badge>{tc("inactive")}</Badge>}
                </li>
              ))}
            </ul>
            <div className="border-t border-line pt-4">
              <LocationForm />
            </div>
          </CardBody>
        </Card>

        <Card id="team">
          <CardHeader title={t("team")} />
          <CardBody className="space-y-4">
            <ul className="divide-y divide-line">
              {team.map((member) => (
                <li
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{member.name}</p>
                    <p className="truncate text-xs text-muted">{member.email}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!beauty && member.instructorProfile?.payPerClassCents ? (
                      <span className="text-xs tabular-nums text-muted">
                        {formatMoney(
                          member.instructorProfile.payPerClassCents,
                          studio.currency,
                          locale,
                        )}
                      </span>
                    ) : null}
                    <Badge tone={member.role === "OWNER" ? "accent" : "neutral"}>
                      {beauty && member.role === "INSTRUCTOR" ? t("roleProfessional") : t(`role${member.role}`)}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-line pt-4">
              <InviteForm currency={studio.currency} beauty={beauty} />
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
