import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { requireRole } from "@/lib/auth/guards";
import { localePath } from "@/i18n/routing";
import { formatDate } from "@/lib/dates";
import { isSubscriptionBillingConfigured } from "@/lib/billing";
import { BEAUTY_PLAN_ORDER, beautyPlan, beautyPriceCents, planLimitProblem, WA_PACK_CENTS } from "@/lib/billing/beauty";
import { billingSummary, receiptLink, transferDetails } from "@/lib/billing/beauty-server";
import { WA_PACK } from "@/lib/brand/pricing";
import { paymentProvider } from "@/lib/payments";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { autoDebitAction, choosePlanAction, payAction } from "./actions";

const pesos = (cents: number) => `$${(cents / 100).toLocaleString("es-UY")}`;

export default async function MyPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ m?: string; pago?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRole(["OWNER"]);
  if (user.studio.brand !== "beauty") redirect(localePath(locale, "/billing"));
  const { m, pago } = await searchParams;

  const [s, transfer] = await Promise.all([billingSummary(user.studioId), transferDetails()]);
  const day = (d: Date) => formatDate(d, user.studio.timezone, locale);
  const trial = s.studio.plan === "TRIAL";
  const overdue = s.daysLeft !== null && s.daysLeft <= 0;
  const canPayOnline = paymentProvider().isConfigured();
  const receipt = receiptLink(transfer, s.studio.name);

  const flash =
    m ??
    (pago === "ok"
      ? "¡Gracias! Recibimos tu pago: en unos minutos se ve acá."
      : pago === "error"
        ? "El pago no se completó. Podés probar de nuevo o pagar por transferencia."
        : null);

  const waTotal = s.wa.quota;
  const waPct = waTotal > 0 ? Math.min(100, Math.round((s.wa.sent / waTotal) * 100)) : 100;

  return (
    <>
      <PageHeader title="Mi plan" description="Tu plan, tus pagos y tus mensajes de WhatsApp." />
      {flash && <p className="mb-4 rounded-[var(--radius-md)] bg-accent-soft px-4 py-3 text-sm text-accent-ink">{flash}</p>}

      <div className="space-y-4">
        {/* ── Your plan ─────────────────────────────── */}
        <Card>
          <CardHeader
            title={trial ? "Prueba gratis" : `Plan ${s.current?.name}`}
            description={
              trial
                ? `Estás probando todo con el plan Equipo.`
                : `${pesos(beautyPriceCents(s.current!.plan, s.launch))} por mes${s.launch ? " · precio de lanzamiento" : ""}`
            }
            action={
              s.autoDebit ? (
                <Badge tone="positive">Débito automático</Badge>
              ) : overdue ? (
                <Badge tone="critical">Vencido</Badge>
              ) : trial ? (
                <Badge tone="accent">{s.daysLeft !== null ? `Quedan ${s.daysLeft} días` : "Prueba"}</Badge>
              ) : (
                <Badge tone="positive">Al día</Badge>
              )
            }
          />
          <CardBody>
            <div className="space-y-3 text-sm text-ink">
              {s.dueAt && (
                <p>
                  {trial
                    ? overdue
                      ? `Tu prueba terminó el ${day(s.dueAt)}.`
                      : `Tu prueba termina el ${day(s.dueAt)}.`
                    : overdue
                      ? `Tu pago venció el ${day(s.dueAt)}.`
                      : `Pagado hasta el ${day(s.dueAt)}.`}{" "}
                  {!s.autoDebit && (
                    <>
                      Tu próximo pago es de <strong>{pesos(s.amountCents)}</strong> por el plan {s.billPlan.name}.
                    </>
                  )}
                </p>
              )}
              {s.studio.nextPlan && s.studio.nextPlan !== "TRIAL" && (
                <p className="text-muted">
                  {trial ? "Elegiste" : "Pasás a"} el plan {beautyPlan(s.studio.nextPlan).name} {trial ? "para cuando termine la prueba" : "desde tu próximo pago"}.
                </p>
              )}
              {trial && !s.studio.nextPlan && (
                <p className="text-muted">
                  Si no elegís un plan, seguís con el plan {s.billPlan.name}, que es el que corresponde a {s.usage.professionals > 1 ? "tu equipo" : "una profesional"}.
                </p>
              )}

              {!s.autoDebit && (
                <div className="space-y-3 rounded-[var(--radius-md)] bg-sunken p-3">
                  <p className="font-medium">Cómo pagar</p>
                  {canPayOnline && (
                    <form action={payAction}>
                      <input type="hidden" name="purpose" value="PLAN" />
                      <SubmitButton pendingLabel="Abriendo Mercado Pago…">Pagar {pesos(s.amountCents)} con Mercado Pago</SubmitButton>
                    </form>
                  )}
                  {transfer ? (
                    <div className="space-y-1">
                      <p className="text-ink-soft">O por transferencia:</p>
                      <p className="whitespace-pre-line rounded-[var(--radius-md)] bg-surface px-3 py-2 font-medium">
                        {[`${transfer.bank}${transfer.accountType ? ` · ${transfer.accountType}` : ""}`, `Cuenta: ${transfer.accountNumber}`, transfer.holder && `A nombre de: ${transfer.holder}`, transfer.note]
                          .filter(Boolean)
                          .join("\n")}
                      </p>
                      {receipt && (
                        <a href={receipt} target="_blank" rel="noreferrer" className="inline-block text-accent underline underline-offset-4">
                          Mandar el comprobante por WhatsApp
                        </a>
                      )}
                    </div>
                  ) : (
                    !canPayOnline && <p className="text-muted">Escribinos y te pasamos los datos para pagar.</p>
                  )}
                  {canPayOnline && isSubscriptionBillingConfigured() && (
                    <form action={autoDebitAction} className="border-t border-line pt-3">
                      <p className="mb-2 text-xs text-muted">¿No querés acordarte cada mes? Con el débito automático se cobra solo con tu tarjeta.</p>
                      <SubmitButton variant="secondary" size="sm" pendingLabel="Abriendo Mercado Pago…">
                        Activar débito automático
                      </SubmitButton>
                    </form>
                  )}
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        {/* ── WhatsApp ──────────────────────────────── */}
        <Card>
          <CardHeader
            title="WhatsApp este mes"
            description={s.wa.renewsAt ? `Tus mensajes se renuevan el ${day(s.wa.renewsAt)}.` : "Los avisos automáticos a tus clientas."}
          />
          <CardBody>
            <div className="space-y-3 text-sm">
              {waTotal > 0 ? (
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-ink">
                      <strong className="text-lg tabular-nums">{s.wa.sent}</strong> de {waTotal} mensajes
                    </span>
                    <span className="text-xs text-muted tabular-nums">{waPct}%</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={s.wa.sent} aria-valuemax={waTotal}>
                    <div
                      className={`h-full rounded-full ${waPct >= 100 ? "bg-critical" : waPct >= 80 ? "bg-caution" : "bg-accent"}`}
                      style={{ width: `${waPct}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-ink-soft">
                  {trial
                    ? "Tu prueba no tiene avisos automáticos por WhatsApp: podés sumar mensajes cuando quieras."
                    : "Tu plan no incluye avisos automáticos por WhatsApp: podés sumar mensajes cuando quieras."}
                </p>
              )}
              {s.wa.extra > 0 && <p className="text-ink-soft">Además tenés {s.wa.extra} mensajes extra, que se usan cuando se terminan los del mes.</p>}
              {waTotal > 0 && waPct >= 80 && s.wa.extra === 0 && (
                <p className="text-caution">Te estás quedando sin mensajes: cuando se terminan, los avisos dejan de salir hasta el mes que viene.</p>
              )}
              {canPayOnline && (
                <form action={payAction}>
                  <input type="hidden" name="purpose" value="WA_PACK" />
                  <SubmitButton variant="secondary" size="sm" pendingLabel="Abriendo Mercado Pago…">
                    Sumar {WA_PACK.messages} mensajes por {pesos(WA_PACK_CENTS)}
                  </SubmitButton>
                </form>
              )}
              {!s.wa.on && (waTotal > 0 || s.wa.extra > 0) && (
                <p className="text-xs text-muted">Los avisos automáticos están apagados: los prendés en Ajustes → WhatsApp.</p>
              )}
            </div>
          </CardBody>
        </Card>

        {/* ── Plans ─────────────────────────────────── */}
        <Card>
          <CardHeader title="Cambiar de plan" description="Si subís, vale desde ya. Si bajás, desde tu próximo pago." />
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-3">
              {BEAUTY_PLAN_ORDER.map((plan) => {
                const p = beautyPlan(plan);
                const current = !trial && s.studio.plan === plan;
                const chosen = s.studio.nextPlan === plan;
                const problem = planLimitProblem(plan, s.usage);
                return (
                  <div
                    key={plan}
                    className={`flex flex-col gap-2 rounded-[var(--radius-md)] border p-3 ${current ? "border-accent bg-accent-soft/40" : "border-line"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-ink">{p.name}</p>
                      {current && <Badge tone="accent">Tu plan</Badge>}
                      {chosen && !current && <Badge tone="caution">Elegido</Badge>}
                    </div>
                    <p className="text-ink">
                      <strong className="text-xl">{pesos(beautyPriceCents(plan, s.launch))}</strong>
                      <span className="text-sm text-muted"> /mes</span>
                      {s.launch && <span className="ml-1.5 text-xs text-muted line-through">{pesos(p.priceUyu * 100)}</span>}
                    </p>
                    <ul className="flex-1 space-y-1 text-xs text-ink-soft">
                      <li>{p.professionals === null ? "Profesionales ilimitadas" : p.professionals === 1 ? "1 profesional" : `Hasta ${p.professionals} profesionales`}</li>
                      <li>{p.locations === null ? "Sucursales ilimitadas" : `${p.locations} sucursal`}</li>
                      <li>{p.waQuota ? `${p.waQuota} mensajes de WhatsApp por mes` : "WhatsApp automático: lo sumás aparte"}</li>
                      <li>Agenda, señas y recordatorios por email</li>
                    </ul>
                    {problem ? (
                      <p className="text-xs text-muted">{problem}</p>
                    ) : current || chosen ? null : (
                      <form action={choosePlanAction}>
                        <input type="hidden" name="plan" value={plan} />
                        <SubmitButton variant="secondary" size="sm" className="w-full" pendingLabel="Guardando…">
                          Elegir {p.name}
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>

        {/* ── History ───────────────────────────────── */}
        {s.charges.length > 0 && (
          <Card>
            <CardHeader title="Tus pagos" />
            <CardBody>
              <ul className="divide-y divide-line text-sm">
                {s.charges.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-ink">
                      {c.paidAt ? day(c.paidAt) : ""} · {c.purpose === "WA_PACK" ? `${WA_PACK.messages} mensajes de WhatsApp` : `${c.months} ${c.months === 1 ? "mes" : "meses"} de plan`}
                    </span>
                    <span className="text-muted">
                      {pesos(c.amountCents)} · {c.method === "MERCADO_PAGO" ? "Mercado Pago" : "Transferencia"}
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
