import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  activeSubscriptions,
  allCharges,
  PAID_PLANS,
  planPrices,
  PLATFORM_CURRENCY,
  subscriptionsNeedingAttention,
} from "@/lib/billing";
import { formatMoney } from "@/lib/money";
import { beautyPlanFor, getAdminProduct, planLabel, PRODUCT_LABEL } from "@/lib/admin/product";
import { BEAUTY_TRIAL_DAYS, LAUNCH_LOCK_MONTHS, LAUNCH_SPOTS } from "@/lib/brand/pricing";
import { saveTransferDetailsAction, setPlanPricesAction, voidChargeAction } from "../actions";
import { billingMessage, transferDetails, upcomingBeautyDues } from "@/lib/billing/beauty-server";
import { beautyPlan } from "@/lib/billing/beauty";
import { CopyText } from "../content/copy-text";

/**
 * The platform's own books.
 *
 * Deliberately not the same thing as a studio's "Ingresos del mes": that is
 * money students paid a studio, this is money studios paid us. Keeping them on
 * separate pages is what stops the two being read as one number.
 */
export default async function AdminPaymentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePlatformAdmin();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const product = await getAdminProduct();
  const beauty = product === "beauty";

  // Fetched across both products, then narrowed to the one on screen.
  const [allRecent, allActive, allAttention, prices, monthTotal, productStudios] =
    await Promise.all([
      allCharges(300),
      activeSubscriptions(),
      subscriptionsNeedingAttention(),
      planPrices(),
      db.subscriptionCharge.aggregate({
        where: {
          status: "APPROVED",
          paidAt: { gte: monthStart },
          subscription: { studio: { brand: product } },
        },
        _sum: { amountCents: true },
      }),
      db.studio.findMany({ where: { brand: product }, select: { id: true } }),
    ]);
  const ours = new Set(productStudios.map((s) => s.id));
  const charges = allRecent.filter((c) => ours.has(c.subscription.studio.id)).slice(0, 60);
  const active = allActive.filter((s) => ours.has(s.studio.id));
  const attention = allAttention.filter((s) => ours.has(s.studio.id));

  // Temppo Beauty: who is due soon or behind, with the message to send them.
  const dues = beauty
    ? await Promise.all(
        (await upcomingBeautyDues()).map(async (d) => ({ ...d, message: (await billingMessage(d.id, d.daysLeft < -2 ? 3 : d.daysLeft <= 0 ? 2 : 1)).text })),
      )
    : [];
  const transfer = beauty ? await transferDetails() : null;

  const money = (cents: number) => formatMoney(cents, PLATFORM_CURRENCY, locale);
  const date = (d: Date) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(d);

  // Recurring revenue: what the live subscriptions bill in a month.
  const mrr = active.reduce((sum, s) => sum + s.amountCents, 0);

  const facts = [
    { label: "Ingreso recurrente", value: money(mrr) },
    {
      label: "Cobrado este mes",
      value: money(monthTotal._sum.amountCents ?? 0),
    },
    { label: "Suscripciones activas", value: String(active.length) },
    { label: "Requieren atención", value: String(attention.length) },
  ];

  return (
    <>
      <h1 className="text-2xl font-semibold">
        Cobros{" "}
        <span className="text-base font-normal text-white/40">· {PRODUCT_LABEL[product]}</span>
      </h1>
      <p className="mt-1 text-sm text-white/40">
        {beauty
          ? "Lo que los negocios nos pagan a nosotros. Las señas de sus clientas van aparte, en Señas."
          : "Lo que los estudios nos pagan a nosotros. No incluye lo que los alumnos pagan a cada estudio."}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {facts.map((fact) => (
          <div key={fact.label} className="rounded-[var(--radius-lg)] bg-white/5 px-4 py-3.5">
            <p className="text-[11px] uppercase tracking-wider text-white/40">{fact.label}</p>
            <p className="mt-1 font-display text-xl font-semibold tabular-nums">{fact.value}</p>
          </div>
        ))}
      </div>

      {beauty && (
        <>
          {/* ── Due soon ───────────────────────────────────────── */}
          <section className="mt-8 overflow-hidden rounded-[var(--radius-lg)] border border-white/10">
            <h2 className="border-b border-white/10 bg-white/5 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
              Próximos vencimientos
            </h2>
            {dues.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-white/40">Nadie vence en los próximos 7 días.</p>
            ) : (
              <ul className="divide-y divide-white/10">
                {dues.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/studios/${d.id}`} className="text-sm underline underline-offset-2">
                        {d.name}
                      </Link>
                      <p className="text-xs text-white/40">
                        {d.trial ? "Prueba" : planLabel("beauty", d.plan)}
                        {d.nextPlan && d.nextPlan !== "TRIAL" && ` → ${beautyPlan(d.nextPlan).name}`}
                        {` · ${d.trial ? "termina" : "vence"} ${date(d.dueAt)}`}
                        {d.autoDebit && " · débito automático"}
                        {d.reminded > 0 && ` · aviso ${d.reminded === 1 ? "previo" : d.reminded === 2 ? "del día" : "de atraso"} enviado`}
                      </p>
                    </div>
                    <span
                      className={`rounded-[var(--radius-pill)] px-3 py-1 text-xs ${
                        d.daysLeft < 0 ? "bg-red-500/20 text-red-300" : d.daysLeft <= 3 ? "bg-amber-500/20 text-amber-200" : "bg-white/10 text-white/60"
                      }`}
                    >
                      {d.daysLeft < 0 ? `Atrasado ${-d.daysLeft} d` : d.daysLeft === 0 ? "Vence hoy" : `En ${d.daysLeft} d`}
                    </span>
                    <CopyText value={d.message} label="Copiar mensaje" />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Transfer details ───────────────────────────────── */}
          <section className="mt-4 rounded-[var(--radius-lg)] border border-white/10 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50">Datos para cobrar</h2>
            <p className="mt-1 text-xs text-white/40">
              Salen en los recordatorios de pago y en «Mi plan» de cada negocio. Cuando llega un comprobante, registrá el pago en la ficha del negocio.
            </p>
            <form action={saveTransferDetailsAction} className="mt-4 grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["bank", "Banco", "BROU"],
                  ["accountType", "Tipo de cuenta", "Caja de ahorro en pesos"],
                  ["accountNumber", "Número de cuenta", ""],
                  ["holder", "Titular", ""],
                  ["whatsapp", "WhatsApp para comprobantes", "+598 9…"],
                  ["note", "Nota (opcional)", "Poné el nombre de tu negocio en el concepto"],
                ] as const
              ).map(([name, label, placeholder]) => (
                <label key={name} className="space-y-1 text-xs text-white/60">
                  <span>{label}</span>
                  <input
                    name={name}
                    defaultValue={transfer?.[name] ?? ""}
                    placeholder={placeholder}
                    required={name === "accountNumber"}
                    className="w-full rounded-[var(--radius-md)] border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
                  />
                </label>
              ))}
              <div className="sm:col-span-2">
                <button className="rounded-[var(--radius-pill)] bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90">Guardar datos</button>
              </div>
            </form>
          </section>
        </>
      )}

      {/* ── Needs chasing ──────────────────────────────────── */}
      <section className="mt-8 overflow-hidden rounded-[var(--radius-lg)] border border-white/10">
        <h2 className="border-b border-white/10 bg-white/5 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
          Requieren atención
        </h2>
        {attention.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-white/40">
            Nadie atrasado. Todos los {beauty ? "negocios" : "estudios"} están al día.
          </p>
        ) : (
          <ul className="divide-y divide-white/10">
            {attention.map((sub) => (
              <li key={sub.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/studios/${sub.studio.id}`}
                    className="text-sm underline underline-offset-2"
                  >
                    {sub.studio.name}
                  </Link>
                  <p className="text-xs text-white/40">
                    {planLabel(product, sub.plan)} · {money(sub.amountCents)}
                    /mes
                    {sub.currentPeriodEnd && ` · pagó hasta ${date(sub.currentPeriodEnd)}`}
                    {sub.studio.suspendedAt && " · estudio suspendido"}
                  </p>
                </div>
                <span
                  className={
                    sub.status === "PAST_DUE"
                      ? "rounded-[var(--radius-pill)] bg-red-500/20 px-3 py-1 text-xs text-red-300"
                      : "rounded-[var(--radius-pill)] bg-amber-500/20 px-3 py-1 text-xs text-amber-200"
                  }
                >
                  {sub.status === "PAST_DUE" ? "Pago rechazado" : "Período vencido"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {beauty ? (
        <>
          {/* ── Prices ─────────────────────────────────────────── */}
          <section className="mt-4 overflow-hidden rounded-[var(--radius-lg)] border border-white/10">
            <h2 className="border-b border-white/10 bg-white/5 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
              Planes de Temppo Beauty
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-white/40">
                  <tr>
                    <th className="px-4 py-2 font-medium">Plan</th>
                    <th className="px-3 py-2 font-medium">Precio / mes</th>
                    <th className="px-3 py-2 font-medium">Profesionales</th>
                    <th className="px-3 py-2 font-medium">Sucursales</th>
                    <th className="px-3 py-2 font-medium">WhatsApp auto</th>
                    <th className="px-3 py-2 font-medium">Activas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {PAID_PLANS.map((plan) => {
                    const p = beautyPlanFor(plan);
                    return (
                      <tr key={plan}>
                        <td className="px-4 py-2.5 font-medium">
                          {p.name} <span className="text-xs text-white/30">{plan}</span>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">
                          <span className="font-semibold">{money(p.launchPriceUyu * 100)}</span>
                          <span className="ml-2 text-xs text-white/30 line-through">
                            {money(p.priceUyu * 100)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-white/60">
                          {p.professionals ?? "Sin límite"}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-white/60">
                          {p.locations === null ? "Varias" : p.locations}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-white/60">
                          {p.waQuota
                            ? `${p.waQuota}/mes`
                            : p.waAddOn
                              ? `add-on ${money(p.waAddOn.priceUyu * 100)}`
                              : "—"}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">
                          {active.filter((s) => s.plan === plan).length}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="border-t border-white/10 px-4 py-3 text-xs text-white/40">
              Los mismos planes y precios que muestra la landing de Beauty. El precio de lanzamiento lo
              mantienen los primeros {LAUNCH_SPOTS} negocios durante {LAUNCH_LOCK_MONTHS} meses; el
              tachado es el precio regular. El primer mes ({BEAUTY_TRIAL_DAYS} días) es gratis y sin
              tarjeta. Al cobrar a mano, cargá el precio de lanzamiento.
            </p>
          </section>
        </>
      ) : (
        <>
          {/* ── Prices ─────────────────────────────────────────── */}
          <section className="mt-4 rounded-[var(--radius-lg)] border border-white/10 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50">
              Precios
            </h2>
            <p className="mt-2 text-sm text-white/50">
              Se aplican a las suscripciones nuevas y a los cobros manuales. Un estudio que ya
              autorizó el débito sigue pagando el monto que autorizó: cambiarlo requiere que vuelva
              a autorizar.
            </p>

            <form action={setPlanPricesAction} className="mt-4 flex flex-wrap items-end gap-3">
              <input type="hidden" name="returnTo" value="/admin/payments" />
              {PAID_PLANS.map((plan) => (
                <label key={plan} className="text-xs text-white/40">
                  {plan} ({PLATFORM_CURRENCY})
                  <input
                    name={plan}
                    required
                    inputMode="numeric"
                    defaultValue={String(Math.round(prices[plan] / 100))}
                    className="mt-1 block w-28 rounded-[var(--radius-md)] border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
                  />
                </label>
              ))}
              <button
                type="submit"
                className="rounded-[var(--radius-pill)] bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
              >
                Guardar precios
              </button>
            </form>
          </section>
        </>
      )}

      {/* ── Ledger ─────────────────────────────────────────── */}
      <section className="mt-4 overflow-hidden rounded-[var(--radius-lg)] border border-white/10">
        <h2 className="border-b border-white/10 bg-white/5 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
          Últimos cobros
        </h2>
        {charges.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-white/40">Todavía no cobramos nada.</p>
        ) : (
          <ul className="divide-y divide-white/10">
            {charges.map((charge) => (
              <li key={charge.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="tabular-nums">{money(charge.amountCents)}</span>
                    <Link
                      href={`/admin/studios/${charge.subscription.studio.id}`}
                      className="ml-2 text-white/70 underline underline-offset-2"
                    >
                      {charge.subscription.studio.name}
                    </Link>
                  </p>
                  <p className="text-xs text-white/40">
                    {charge.method === "BANK_TRANSFER" ? "transferencia" : "Mercado Pago"}
                    {charge.months > 1 && ` · ${charge.months} meses`}
                    {charge.note && ` · ${charge.note}`} · {date(charge.paidAt ?? charge.createdAt)}
                  </p>
                </div>

                <span
                  className={
                    charge.status === "APPROVED"
                      ? "text-xs text-emerald-300"
                      : charge.status === "REFUNDED"
                        ? "text-xs text-white/30 line-through"
                        : "text-xs text-white/40"
                  }
                >
                  {charge.status}
                </span>

                {/*
                  Only manual charges can be undone here. A Mercado Pago charge
                  is theirs to reverse — marking it refunded on our side would
                  just make the two copies disagree.
                */}
                {charge.method === "BANK_TRANSFER" && charge.status === "APPROVED" && (
                  <form action={voidChargeAction}>
                    <input type="hidden" name="chargeId" value={charge.id} />
                    <input type="hidden" name="returnTo" value="/admin/payments" />
                    <button
                      type="submit"
                      className="rounded-[var(--radius-pill)] px-3 py-1.5 text-xs text-white/60 hover:bg-red-500/20 hover:text-red-200"
                    >
                      Anular
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
