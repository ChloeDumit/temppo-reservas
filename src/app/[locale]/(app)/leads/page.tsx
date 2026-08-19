import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { convertLeadAction, dismissLeadAction } from "./actions";

const TONE = {
  NEW: "accent",
  CONTACTED: "neutral",
  BOOKED: "caution",
  CONVERTED: "positive",
  LOST: "neutral",
} as const;

export default async function LeadsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireStaff();
  const studio = user.studio;
  const t = await getTranslations("leads");

  const leads = await db.lead.findMany({
    where: { studioId: studio.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { classInstance: true },
  });

  const base = process.env.APP_URL || "http://localhost:3000";
  const publicUrl = `${base}${locale === "es" ? "" : `/${locale}`}/t/${studio.slug}`;

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      <Card className="mb-5">
        <CardHeader title={t("publicLink")} description={t("copyHint")} />
        <CardBody>
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block break-all rounded-md bg-sunken px-3 py-2 font-mono text-sm text-accent"
          >
            {publicUrl}
          </a>
        </CardBody>
      </Card>

      {leads.length === 0 ? (
        <Card>
          <EmptyState message={t("empty")} />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {leads.map((lead) => (
              <li key={lead.id} className="space-y-2 px-4 py-3.5 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                      {lead.name}
                      <Badge tone={TONE[lead.status]}>{t(`status${lead.status}`)}</Badge>
                    </p>
                    <p className="truncate text-xs text-muted">
                      {lead.email}
                      {lead.phone ? ` · ${lead.phone}` : ""}
                      {lead.source ? ` · ${lead.source}` : ""}
                    </p>
                    {lead.classInstance && (
                      <p className="mt-0.5 text-xs text-muted">
                        {lead.classInstance.name} ·{" "}
                        {formatDateTime(lead.classInstance.startsAt, studio.timezone, locale)}
                      </p>
                    )}
                    {lead.message && (
                      <p className="mt-1 text-sm text-ink-soft">“{lead.message}”</p>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {lead.status === "CONVERTED" && lead.convertedStudentId ? (
                      <Link
                        href={`/students/${lead.convertedStudentId}`}
                        className="text-xs text-accent underline underline-offset-4"
                      >
                        {t("converted")}
                      </Link>
                    ) : (
                      <>
                        <form action={convertLeadAction}>
                          <input type="hidden" name="leadId" value={lead.id} />
                          <Button type="submit" size="sm">
                            {t("convert")}
                          </Button>
                        </form>
                        {lead.status !== "LOST" && (
                          <form action={dismissLeadAction}>
                            <input type="hidden" name="leadId" value={lead.id} />
                            <Button type="submit" variant="ghost" size="sm">
                              {t("markLost")}
                            </Button>
                          </form>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
