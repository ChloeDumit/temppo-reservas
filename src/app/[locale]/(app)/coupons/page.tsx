import { setRequestLocale } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { dateKeyInZone, formatDate } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { createCouponAction, toggleCouponAction } from "./actions";
import { ConfirmDelete } from "./confirm-delete";

/**
 * Discount codes the business hands its clients: typed when booking a
 * service (Temppo Beauty) or buying a pack (TEMPPO Reservas).
 */
export default async function CouponsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireAdmin();
  const { m } = await searchParams;
  const studio = user.studio;
  const beauty = studio.vertical === "APPOINTMENTS";
  const what = beauty ? "servicios" : "packs";

  const [coupons, targets] = await Promise.all([
    db.coupon.findMany({ where: { studioId: studio.id }, orderBy: { createdAt: "desc" } }),
    beauty
      ? db.service.findMany({ where: { studioId: studio.id, isActive: true }, select: { id: true, name: true }, orderBy: { position: "asc" } })
      : db.classPack.findMany({ where: { studioId: studio.id, isActive: true }, select: { id: true, name: true }, orderBy: { priceCents: "asc" } }),
  ]);
  const codes = coupons.map((c) => c.code);
  const [apptUses, payUses] = await Promise.all([
    db.appointment.groupBy({ by: ["couponCode"], where: { studioId: studio.id, couponCode: { in: codes } }, _count: true }),
    db.payment.groupBy({ by: ["couponCode"], where: { studioId: studio.id, couponCode: { in: codes }, status: { not: "REJECTED" } }, _count: true }),
  ]);
  const uses = (code: string) =>
    (apptUses.find((u) => u.couponCode === code)?._count ?? 0) + (payUses.find((u) => u.couponCode === code)?._count ?? 0);

  const now = new Date();
  const day = (d: Date) => formatDate(d, studio.timezone, locale);
  const names = (ids: string[]) =>
    ids.length ? ids.map((id) => targets.find((t) => t.id === id)?.name).filter(Boolean).join(", ") || `${what} que ya no están` : `Todos los ${what}`;
  const today = dateKeyInZone(now, studio.timezone);

  return (
    <>
      <PageHeader
        title="Cupones"
        description={`Códigos de descuento para tus clientas: los escriben al ${beauty ? "reservar un servicio" : "comprar un pack"}.`}
      />
      {m && <p className="mb-4 rounded-[var(--radius-md)] bg-accent-soft px-4 py-3 text-sm text-accent-ink">{m}</p>}

      <div className="space-y-4">
        <Card>
          <CardHeader title="Nuevo cupón" />
          <CardBody>
            <form action={createCouponAction} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Código" hint="Lo que escribe tu clienta, por ejemplo VERANO20.">
                  <Input name="code" required minLength={3} maxLength={20} autoCapitalize="characters" autoComplete="off" className="uppercase" placeholder="VERANO20" />
                </Field>
                <Field label="Descuento (%)">
                  <Input name="percentOff" type="number" required min={1} max={100} placeholder="20" />
                </Field>
                <Field label="Desde (opcional)">
                  <Input name="from" type="date" min={today} />
                </Field>
                <Field label="Hasta (opcional)" hint="Vale hasta el final de ese día.">
                  <Input name="until" type="date" min={today} />
                </Field>
              </div>
              {targets.length > 0 && (
                <fieldset className="space-y-2 rounded-[var(--radius-md)] bg-sunken p-3">
                  <legend className="mb-1 text-sm font-medium text-ink-soft">Vale para</legend>
                  <p className="text-xs text-muted">Si no marcás ninguno, vale para todos los {what}.</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {targets.map((t) => (
                      <label key={t.id} className="flex items-center gap-2.5 text-sm text-ink">
                        <input type="checkbox" name="targets" value={t.id} className="size-4 accent-[var(--color-accent)]" />
                        {t.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <SubmitButton pendingLabel="Creando…">Crear cupón</SubmitButton>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Tus cupones" />
          <CardBody>
            {coupons.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">Todavía no creaste ninguno.</p>
            ) : (
              <ul className="divide-y divide-line">
                {coupons.map((c) => {
                  const state = !c.isActive
                    ? { label: "Pausado", tone: "neutral" as const }
                    : c.validUntil && now > c.validUntil
                      ? { label: "Vencido", tone: "neutral" as const }
                      : c.validFrom && now < c.validFrom
                        ? { label: "Todavía no", tone: "caution" as const }
                        : { label: "Activo", tone: "positive" as const };
                  const used = uses(c.code);
                  return (
                    <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                      <div className="min-w-0 space-y-0.5">
                        <p className="flex items-center gap-2">
                          <span className="font-mono text-base font-semibold tracking-wide text-ink">{c.code}</span>
                          <span className="text-sm font-medium text-accent">−{c.percentOff} %</span>
                          <Badge tone={state.tone}>{state.label}</Badge>
                        </p>
                        <p className="text-xs text-muted">{names(beauty ? c.serviceIds : c.packIds)}</p>
                        <p className="text-xs text-muted">
                          {c.validFrom || c.validUntil
                            ? `${c.validFrom ? `Desde el ${day(c.validFrom)}` : "Desde ya"}${c.validUntil ? ` hasta el ${day(c.validUntil)}` : ", sin fecha de fin"}`
                            : "Sin fechas"}
                          {` · usado ${used} ${used === 1 ? "vez" : "veces"}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <form action={toggleCouponAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <button className="text-xs font-medium text-accent underline-offset-4 hover:underline">{c.isActive ? "Pausar" : "Activar"}</button>
                        </form>
                        <ConfirmDelete id={c.id} code={c.code} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
