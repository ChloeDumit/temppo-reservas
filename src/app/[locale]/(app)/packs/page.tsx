import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { SheetForm } from "@/components/app/sheet-form";
import { PackForm } from "./pack-form";
import { togglePackAction } from "./actions";

export default async function PacksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireAdmin();
  const studio = user.studio;
  const t = await getTranslations("packs");
  const tc = await getTranslations("common");
  const tcl = await getTranslations("classes");

  const packs = await db.classPack.findMany({
    where: { studioId: studio.id },
    orderBy: [{ isActive: "desc" }, { priceCents: "asc" }],
    include: { _count: { select: { studentPacks: true } } },
  });

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        action={
          <SheetForm label={t("newPack")} title={t("newPack")}>
            <PackForm
              currency={studio.currency}
              values={{
            name: "",
            description: "",
            credits: 8,
            isUnlimited: false,
            price: "",
                validityDays: 30,
              }}
            />
          </SheetForm>
        }
      />

      {packs.length === 0 ? (
        <Card>
          <EmptyState message={t("empty")} />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {packs.map((pack) => (
            <Card key={pack.id}>
              <CardBody className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                      {pack.name}
                      {!pack.isActive && <Badge>{tc("inactive")}</Badge>}
                    </p>
                    <p className="mt-0.5 text-sm text-muted">
                      {pack.isUnlimited
                        ? t("unlimited")
                        : t("creditsLabel", { count: pack.credits })}{" "}
                      · {t("validityLabel", { days: pack.validityDays })}
                    </p>
                    {pack.description && (
                      <p className="mt-1 text-sm text-ink-soft">{pack.description}</p>
                    )}
                  </div>
                  <p className="shrink-0 font-display text-lg font-semibold tabular-nums">
                    {formatMoney(pack.priceCents, studio.currency, locale)}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted">{pack._count.studentPacks}</span>
                  <form action={togglePackAction}>
                    <input type="hidden" name="id" value={pack.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      {pack.isActive ? tcl("deactivate") : tcl("activate")}
                    </Button>
                  </form>
                </div>

                <div>
                  <SheetForm
                    label={tc("edit")}
                    title={t("editPack")}
                    variant="secondary"
                    icon={null}
                  >
                    <PackForm
                      currency={studio.currency}
                      values={{
                        id: pack.id,
                        name: pack.name,
                        description: pack.description ?? "",
                        credits: pack.credits,
                        isUnlimited: pack.isUnlimited,
                        price: String(pack.priceCents / 100),
                        validityDays: pack.validityDays,
                      }}
                    />
                  </SheetForm>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
