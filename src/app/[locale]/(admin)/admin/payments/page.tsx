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
import { setPlanPricesAction, voidChargeAction } from "../actions";

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

  const [charges, active, attention, prices, monthTotal] = await Promise.all([
    allCharges(60),
    activeSubscriptions(),
    subscriptionsNeedingAttention(),
    planPrices(),
    db.subscriptionCharge.aggregate({
      where: { status: "APPROVED", paidAt: { gte: monthStart } },
      _sum: { amountCents: true },
    }),
  ]);

  const money = (cents: number) => formatMoney(cents, PLATFORM_CURRENCY, locale);
  const date = (d: Date) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(d);

  // Recurring revenue: what the live subscriptions bill in a month.
  const mrr = active.reduce((sum, s) => sum + s.amountCents, 0);

  const facts = [
    { label: "Ingreso recurrente", value: money(mrr) },
    { label: "Cobrado este mes", value: money(monthTotal._sum.amountCents ?? 0) },
    { label: "Suscripciones activas", value: String(active.length) },
    { label: "Requieren atención", value: String(attention.length) },
  ];

  return (
    <>
      <h1 className="text-2xl font-semibold">Cobros</h1>
      <p className="mt-1 text-sm text-white/40">
        Lo que los estudios nos pagan a nosotros. No incluye lo que los alumnos pagan a cada
        estudio.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {facts.map((fact) => (
          <div key={fact.label} className="rounded-[var(--radius-lg)] bg-white/5 px-4 py-3.5">
            <p className="text-[11px] uppercase tracking-wider text-white/40">{fact.label}</p>
            <p className="mt-1 font-display text-xl font-semibold tabular-nums">{fact.value}</p>
          </div>
        ))}
      </div>

      {/* ── Needs chasing ──────────────────────────────────── */}
      <section className="mt-8 overflow-hidden rounded-[var(--radius-lg)] border border-white/10">
        <h2 className="border-b border-white/10 bg-white/5 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
          Requieren atención
        </h2>
        {attention.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-white/40">
            Nadie atrasado. Todos los estudios están al día.
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
                    {sub.plan} · {money(sub.amountCents)}/mes
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

      {/* ── Prices ─────────────────────────────────────────── */}
      <section className="mt-4 rounded-[var(--radius-lg)] border border-white/10 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50">Precios</h2>
        <p className="mt-2 text-sm text-white/50">
          Se aplican a las suscripciones nuevas y a los cobros manuales. Un estudio que ya autorizó
          el débito sigue pagando el monto que autorizó: cambiarlo requiere que vuelva a autorizar.
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
                    {charge.note && ` · ${charge.note}`} ·{" "}
                    {date(charge.paidAt ?? charge.createdAt)}
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
