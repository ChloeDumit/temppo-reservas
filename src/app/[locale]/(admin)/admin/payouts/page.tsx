import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { createPayoutAction } from "../actions";

/**
 * Deposits the platform collected online for appointment businesses, and
 * what has been handed over. This money is the studios', not ours: it sits
 * here only until the next transfer.
 */
export default async function AdminPayoutsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePlatformAdmin();

  const [owed, payouts] = await Promise.all([
    db.payment.groupBy({
      by: ["studioId", "currency"],
      where: { appointmentId: { not: null }, method: "MERCADO_PAGO", status: "APPROVED", payoutId: null },
      _sum: { amountCents: true },
      _count: true,
      _min: { approvedAt: true },
    }),
    db.studioPayout.findMany({ orderBy: { createdAt: "desc" }, take: 40, include: { studio: { select: { name: true } } } }),
  ]);
  const studios = await db.studio.findMany({
    where: { id: { in: owed.map((o) => o.studioId) } },
    select: { id: true, name: true, whatsappNumber: true },
  });
  const nameOf = (id: string) => studios.find((s) => s.id === id)?.name ?? id;
  const date = (d: Date) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(d);

  return (
    <>
      <h1 className="text-2xl font-semibold">Señas</h1>
      <p className="mt-1 text-sm text-white/40">
        Señas cobradas por Mercado Pago a nombre de cada negocio. Es plata de ellos: se les transfiere y se registra
        acá.
      </p>

      <section className="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-white/10">
        <h2 className="border-b border-white/10 bg-white/5 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
          Pendiente de transferir
        </h2>
        {owed.length === 0 ? (
          <p className="px-4 py-6 text-sm text-white/40">No le debemos nada a nadie.</p>
        ) : (
          <ul className="divide-y divide-white/10">
            {owed.map((o) => (
              <li key={o.studioId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <Link href={`/admin/studios/${o.studioId}`} className="font-medium hover:underline">
                    {nameOf(o.studioId)}
                  </Link>
                  <p className="text-xs text-white/40">
                    {o._count} señas · desde {o._min.approvedAt ? date(o._min.approvedAt) : "—"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-display text-lg font-semibold tabular-nums">
                    {formatMoney(o._sum.amountCents ?? 0, o.currency, locale)}
                  </span>
                  <form action={createPayoutAction} className="flex items-center gap-2">
                    <input type="hidden" name="studioId" value={o.studioId} />
                    <input
                      name="reference"
                      placeholder="Referencia (BROU 21/10)"
                      className="w-44 rounded-md border border-white/15 bg-transparent px-2.5 py-1.5 text-sm placeholder:text-white/30"
                    />
                    <button type="submit" className="rounded-[var(--radius-pill)] bg-white px-3 py-1.5 text-sm font-medium text-ink">
                      Marcar transferido
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 overflow-hidden rounded-[var(--radius-lg)] border border-white/10">
        <h2 className="border-b border-white/10 bg-white/5 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
          Transferencias hechas
        </h2>
        {payouts.length === 0 ? (
          <p className="px-4 py-6 text-sm text-white/40">Ninguna todavía.</p>
        ) : (
          <ul className="divide-y divide-white/10 text-sm">
            {payouts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                <span>
                  {p.studio.name}
                  <span className="text-white/40"> · {p.paidAt ? date(p.paidAt) : "—"}{p.reference ? ` · ${p.reference}` : ""}</span>
                </span>
                <span className="tabular-nums">{formatMoney(p.amountCents, p.currency, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
