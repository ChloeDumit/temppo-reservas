import { getTranslations, setRequestLocale } from "next-intl/server";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { durationLabel, requireAppointmentAdmin } from "@/lib/appointments/guards";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader, EmptyState, SectionLabel } from "@/components/ui/page-header";
import { SheetForm } from "@/components/app/sheet-form";
import { ServiceForm, type ServiceValues } from "./service-form";
import { AddOnForm } from "./addon-form";
import { CategoryForm } from "./category-form";
import { deleteCategoryAction, toggleAddOnAction, toggleServiceAction } from "./actions";

export default async function ServicesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireAppointmentAdmin();
  const studio = user.studio;
  const t = await getTranslations("services");
  const tc = await getTranslations("common");

  const [categories, services, addOns, staff] = await Promise.all([
    db.serviceCategory.findMany({ where: { studioId: studio.id }, orderBy: { position: "asc" } }),
    db.service.findMany({
      where: { studioId: studio.id },
      orderBy: [{ isActive: "desc" }, { position: "asc" }],
      include: { staff: { include: { staff: { select: { name: true } } } } },
    }),
    db.addOn.findMany({ where: { studioId: studio.id }, orderBy: [{ isActive: "desc" }, { name: "asc" }], include: { service: true } }),
    db.user.findMany({
      where: { studioId: studio.id, isActive: true, role: { in: ["OWNER", "ADMIN", "INSTRUCTOR"] } },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const money = (cents: number) => formatMoney(cents, studio.currency, locale);
  const blank: ServiceValues = {
    name: "",
    description: "",
    categoryId: categories[0]?.id ?? "",
    durationMin: 60,
    price: "",
    depositType: "NONE",
    depositValue: "",
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    rebookAfterDays: "",
    staffIds: [],
  };

  const depositText = (s: (typeof services)[number]) =>
    s.depositType === "PERCENT"
      ? t("depositShortPercent", { value: s.depositValue })
      : s.depositType === "FIXED"
        ? t("depositShortFixed", { amount: money(s.depositValue) })
        : null;

  // Services under their category, in the studio's order; the rest last.
  const groups = [
    ...categories.map((c) => ({ category: c, items: services.filter((s) => s.categoryId === c.id) })),
    { category: null, items: services.filter((s) => !s.categoryId) },
  ].filter((g) => g.items.length > 0 || g.category);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        action={
          <SheetForm label={t("newService")} title={t("newService")}>
            <ServiceForm values={blank} currency={studio.currency} categories={categories} staff={staff} />
          </SheetForm>
        }
      />

      {services.length === 0 ? (
        <Card>
          <EmptyState message={t("empty")} />
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(({ category, items }) => (
            <section key={category?.id ?? "none"}>
              <div className="flex items-center justify-between">
                <SectionLabel>{category?.name ?? t("noCategory")}</SectionLabel>
                {category && items.length === 0 && (
                  <form action={deleteCategoryAction}>
                    <input type="hidden" name="id" value={category.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      {tc("delete")}
                    </Button>
                  </form>
                )}
              </div>
              {items.length === 0 ? (
                <p className="px-1 text-sm text-muted">{t("emptyCategory")}</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {items.map((s) => (
                    <Card key={s.id}>
                      <CardBody className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                              {s.name}
                              {!s.isActive && <Badge>{tc("inactive")}</Badge>}
                            </p>
                            <p className="mt-0.5 text-sm text-muted">
                              {durationLabel(s.durationMin)}
                              {s.bufferAfterMin > 0 && ` · ${t("cleanupShort", { minutes: s.bufferAfterMin })}`}
                            </p>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {depositText(s) && <Badge tone="accent">{depositText(s)}</Badge>}
                              {s.rebookAfterDays && <Badge>{t("rebookShort", { days: s.rebookAfterDays })}</Badge>}
                              {s.staff.length > 0 && <Badge>{s.staff.map((x) => x.staff.name).join(", ")}</Badge>}
                            </div>
                          </div>
                          <p className="shrink-0 font-display text-lg font-semibold tabular-nums">{money(s.priceCents)}</p>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <SheetForm label={tc("edit")} title={t("editService")} variant="secondary" icon={null}>
                            <ServiceForm
                              currency={studio.currency}
                              categories={categories}
                              staff={staff}
                              values={{
                                id: s.id,
                                name: s.name,
                                description: s.description ?? "",
                                categoryId: s.categoryId ?? "",
                                durationMin: s.durationMin,
                                price: String(s.priceCents / 100),
                                depositType: s.depositType,
                                depositValue:
                                  s.depositType === "FIXED" ? String(s.depositValue / 100) : String(s.depositValue || ""),
                                bufferBeforeMin: s.bufferBeforeMin,
                                bufferAfterMin: s.bufferAfterMin,
                                rebookAfterDays: s.rebookAfterDays ? String(s.rebookAfterDays) : "",
                                staffIds: s.staff.map((x) => x.staffId),
                              }}
                            />
                          </SheetForm>
                          <form action={toggleServiceAction}>
                            <input type="hidden" name="id" value={s.id} />
                            <Button type="submit" variant="ghost" size="sm">
                              {s.isActive ? t("hide") : t("show")}
                            </Button>
                          </form>
                        </div>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      <div className="mt-6">
        <SheetForm label={t("newCategory")} title={t("newCategory")} variant="ghost">
          <CategoryForm />
        </SheetForm>
      </div>

      <section className="mt-8">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <SectionLabel>{t("addOns")}</SectionLabel>
            <p className="-mt-1 px-1 text-sm text-muted">{t("addOnsHint")}</p>
          </div>
          <SheetForm label={t("newAddOn")} title={t("newAddOn")} variant="secondary">
            <AddOnForm
              currency={studio.currency}
              services={services.map((s) => ({ id: s.id, name: s.name }))}
              values={{ name: "", serviceId: "", durationMin: 15, price: "" }}
            />
          </SheetForm>
        </div>
        {addOns.length === 0 ? (
          <Card>
            <EmptyState message={t("noAddOns")} />
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {addOns.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                      {a.name}
                      {!a.isActive && <Badge>{tc("inactive")}</Badge>}
                    </p>
                    <p className="text-xs text-muted">
                      +{a.durationMin} min · +{money(a.priceCents)} · {a.service?.name ?? t("addOnAll")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <SheetForm label={tc("edit")} title={t("editAddOn")} variant="ghost" icon={null}>
                      <AddOnForm
                        currency={studio.currency}
                        services={services.map((s) => ({ id: s.id, name: s.name }))}
                        values={{
                          id: a.id,
                          name: a.name,
                          serviceId: a.serviceId ?? "",
                          durationMin: a.durationMin,
                          price: String(a.priceCents / 100),
                        }}
                      />
                    </SheetForm>
                    <form action={toggleAddOnAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        {a.isActive ? t("hide") : t("show")}
                      </Button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <p className="mt-8 text-sm text-muted">
        {t("bookingPageIs")}{" "}
        <ButtonLink href={`/b/${studio.slug}`} variant="ghost" size="sm">
          /b/{studio.slug}
        </ButtonLink>
      </p>
    </>
  );
}
