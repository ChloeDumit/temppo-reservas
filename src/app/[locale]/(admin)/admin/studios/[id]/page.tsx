import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import {
  chargesFor,
  PAID_PLANS,
  PLAN_PRICE_CENTS,
  PLATFORM_CURRENCY,
  subscriptionFor,
} from "@/lib/billing";
import {
  setPlanAction,
  extendTrialAction,
  recordManualChargeAction,
  toggleSuspendAction,
  toggleUserActiveAction,
} from "../../actions";

const PLANS = ["TRIAL", "ESSENTIAL", "STUDIO", "NETWORK"] as const;

const SUBSCRIPTION_LABEL: Record<string, string> = {
  PENDING: "Esperando autorización",
  ACTIVE: "Al día",
  PAST_DUE: "Pago rechazado",
  PAUSED: "En pausa",
  CANCELLED: "Cancelada",
};

export default async function AdminStudioPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requirePlatformAdmin();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const studio = await db.studio.findUnique({
    where: { id },
    include: {
      users: { orderBy: [{ role: "asc" }, { name: "asc" }] },
      _count: { select: { classInstances: true, bookings: true, classTemplates: true } },
    },
  });

  if (!studio) notFound();

  const [income, recentAudit, subscription, charges] = await Promise.all([
    db.transaction.aggregate({
      where: { studioId: id, type: "INCOME", occurredAt: { gte: monthStart } },
      _sum: { amountCents: true },
    }),
    db.auditLog.findMany({
      where: { studioId: id },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    subscriptionFor(id),
    chargesFor(id, 6),
  ]);

  const date = (d: Date) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(d);

  const facts = [
    { label: "Usuarios", value: studio.users.length },
    { label: "Clases recurrentes", value: studio._count.classTemplates },
    { label: "Reservas", value: studio._count.bookings },
    {
      label: "Ingresos del mes",
      value: formatMoney(income._sum.amountCents ?? 0, studio.currency, locale),
    },
  ];

  return (
    <>
      <Link href="/admin" className="text-sm text-white/50 underline underline-offset-4">
        ← Estudios
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{studio.name}</h1>
          <p className="mt-1 text-sm text-white/40">
            /{studio.slug} · {studio.timezone} · desde {date(studio.createdAt)}
          </p>
        </div>
        {studio.suspendedAt && (
          <span className="rounded-[var(--radius-pill)] bg-red-500/20 px-3 py-1 text-xs text-red-300">
            Suspendido {date(studio.suspendedAt)}
          </span>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {facts.map((fact) => (
          <div key={fact.label} className="rounded-[var(--radius-lg)] bg-white/5 px-4 py-3.5">
            <p className="text-[11px] uppercase tracking-wider text-white/40">{fact.label}</p>
            <p className="mt-1 font-display text-xl font-semibold tabular-nums">{fact.value}</p>
          </div>
        ))}
      </div>

      {/* ── Plan and trial ─────────────────────────────────── */}
      <section className="mt-8 rounded-[var(--radius-lg)] border border-white/10 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50">Plan</h2>

        <form action={setPlanAction} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="studioId" value={studio.id} />
          <select
            name="plan"
            defaultValue={studio.plan}
            className="rounded-[var(--radius-md)] border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
          >
            {PLANS.map((plan) => (
              <option key={plan} value={plan} className="bg-ink">
                {plan}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-[var(--radius-pill)] bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
          >
            Cambiar plan
          </button>
        </form>

        <form action={extendTrialAction} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="studioId" value={studio.id} />
          <span className="text-sm text-white/50">
            Prueba{" "}
            {studio.trialEndsAt ? `hasta ${date(studio.trialEndsAt)}` : "sin fecha"}
          </span>
          <input
            name="days"
            type="number"
            min={1}
            max={365}
            defaultValue={30}
            className="w-20 rounded-[var(--radius-md)] border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
          />
          <button
            type="submit"
            className="rounded-[var(--radius-pill)] bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
          >
            Extender días
          </button>
        </form>
      </section>

      {/* ── Subscription ───────────────────────────────────── */}
      <section className="mt-4 rounded-[var(--radius-lg)] border border-white/10 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50">
            Suscripción
          </h2>
          {subscription && (
            <span
              className={
                subscription.status === "ACTIVE"
                  ? "rounded-[var(--radius-pill)] bg-emerald-500/20 px-3 py-1 text-xs text-emerald-200"
                  : subscription.status === "PAST_DUE"
                    ? "rounded-[var(--radius-pill)] bg-red-500/20 px-3 py-1 text-xs text-red-300"
                    : "rounded-[var(--radius-pill)] bg-white/10 px-3 py-1 text-xs text-white/60"
              }
            >
              {SUBSCRIPTION_LABEL[subscription.status] ?? subscription.status}
            </span>
          )}
        </div>

        {subscription ? (
          <p className="mt-2 text-sm text-white/50">
            {formatMoney(subscription.amountCents, subscription.currency, locale)}/mes ·{" "}
            {subscription.providerRef ? "débito automático" : "cobro manual"}
            {subscription.currentPeriodEnd && ` · paga hasta ${date(subscription.currentPeriodEnd)}`}
          </p>
        ) : (
          <p className="mt-2 text-sm text-white/50">
            Sin suscripción. Registrá un pago para dejar constancia de un cobro por transferencia.
          </p>
        )}

        {/*
          The manual path. A studio on auto-debit never needs this, but a
          transfer that landed in the bank has to be recordable by hand or the
          plan and the money drift apart.
        */}
        <form
          action={recordManualChargeAction}
          className="mt-4 flex flex-wrap items-end gap-2 border-t border-white/10 pt-4"
        >
          <input type="hidden" name="studioId" value={studio.id} />
          <label className="text-xs text-white/40">
            Plan
            <select
              name="plan"
              defaultValue={
                subscription?.plan && subscription.plan !== "TRIAL" ? subscription.plan : "ESSENTIAL"
              }
              className="mt-1 block rounded-[var(--radius-md)] border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
            >
              {PAID_PLANS.map((plan) => (
                <option key={plan} value={plan} className="bg-ink">
                  {plan}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-white/40">
            Monto ({PLATFORM_CURRENCY})
            {/*
              Left blank it bills the list price, which is what almost every
              transfer is. Typing a separator here is the one place a thousands
              dot could be read as a decimal point, so the field stays optional
              and the placeholder shows plain digits.
            */}
            <input
              name="amount"
              inputMode="numeric"
              placeholder={String(Math.round(PLAN_PRICE_CENTS.STUDIO / 100))}
              className="mt-1 block w-28 rounded-[var(--radius-md)] border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30"
            />
          </label>
          <label className="text-xs text-white/40">
            Meses
            <input
              name="months"
              type="number"
              min={1}
              max={24}
              defaultValue={1}
              className="mt-1 block w-20 rounded-[var(--radius-md)] border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
            />
          </label>
          <input
            name="note"
            placeholder="Referencia (transferencia BROU…)"
            maxLength={200}
            className="mt-1 min-w-0 flex-1 rounded-[var(--radius-md)] border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30"
          />
          <button
            type="submit"
            className="rounded-[var(--radius-pill)] bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
          >
            Registrar pago
          </button>
        </form>

        {charges.length > 0 && (
          <ul className="mt-4 space-y-1.5 border-t border-white/10 pt-4 text-xs">
            {charges.map((charge) => (
              <li key={charge.id} className="flex flex-wrap gap-x-3 text-white/50">
                <span className="tabular-nums text-white/80">
                  {formatMoney(charge.amountCents, charge.currency, locale)}
                </span>
                <span>{charge.method === "BANK_TRANSFER" ? "transferencia" : "Mercado Pago"}</span>
                <span className={charge.status === "APPROVED" ? "text-emerald-300" : "text-white/40"}>
                  {charge.status}
                </span>
                {charge.note && <span className="text-white/30">{charge.note}</span>}
                <span className="ml-auto text-white/30">
                  {date(charge.paidAt ?? charge.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Suspension ─────────────────────────────────────── */}
      <section className="mt-4 rounded-[var(--radius-lg)] border border-white/10 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50">Acceso</h2>
        <p className="mt-2 text-sm text-white/50">
          Suspender corta el acceso de todo el estudio sin borrar nada. Las sesiones abiertas se
          cierran en el momento.
        </p>

        <form action={toggleSuspendAction} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="studioId" value={studio.id} />
          {!studio.suspendedAt && (
            <input
              name="reason"
              placeholder="Motivo (lo ve el estudio)"
              maxLength={200}
              className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30"
            />
          )}
          <button
            type="submit"
            className={
              studio.suspendedAt
                ? "rounded-[var(--radius-pill)] bg-emerald-500/20 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-500/30"
                : "rounded-[var(--radius-pill)] bg-red-500/20 px-4 py-2 text-sm text-red-200 hover:bg-red-500/30"
            }
          >
            {studio.suspendedAt ? "Reactivar estudio" : "Suspender estudio"}
          </button>
        </form>
      </section>

      {/* ── People ─────────────────────────────────────────── */}
      <section className="mt-4 overflow-hidden rounded-[var(--radius-lg)] border border-white/10">
        <h2 className="border-b border-white/10 bg-white/5 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
          Usuarios
        </h2>
        <ul className="divide-y divide-white/10">
          {studio.users.map((user) => (
            <li key={user.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  {user.name}
                  {user.isPlatformAdmin && (
                    <span className="ml-2 rounded-[var(--radius-pill)] bg-[#E07A5F]/25 px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#E07A5F]">
                      plataforma
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-white/40">
                  {user.email} · {user.role}
                  {!user.isActive && " · inactivo"}
                </p>
              </div>
              <form action={toggleUserActiveAction}>
                <input type="hidden" name="userId" value={user.id} />
                <button
                  type="submit"
                  className="rounded-[var(--radius-pill)] px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 hover:text-white"
                >
                  {user.isActive ? "Desactivar" : "Activar"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Recent activity ────────────────────────────────── */}
      <section className="mt-4 overflow-hidden rounded-[var(--radius-lg)] border border-white/10">
        <h2 className="border-b border-white/10 bg-white/5 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
          Actividad reciente
        </h2>
        {recentAudit.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-white/40">Sin actividad registrada.</p>
        ) : (
          <ul className="divide-y divide-white/10 text-sm">
            {recentAudit.map((entry) => (
              <li key={entry.id} className="flex flex-wrap gap-x-3 px-4 py-2.5">
                <span className="font-mono text-xs text-white/70">{entry.action}</span>
                <span className="text-xs text-white/40">{entry.actorLabel ?? "—"}</span>
                <span className="ml-auto text-xs text-white/30">{date(entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
