import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { getAdminProduct, planLabel, PRODUCT_LABEL } from "@/lib/admin/product";
import type { Plan } from "@/generated/prisma/enums";

/** Days until a trial ends. Negative once it has lapsed. */
function daysUntil(date: Date | null) {
  if (!date) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

const PLAN_ORDER: Plan[] = ["TRIAL", "ESSENTIAL", "STUDIO", "NETWORK"];
const STAFF_ROLES = ["OWNER", "ADMIN", "INSTRUCTOR"] as const;

export default async function AdminStudiosPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requirePlatformAdmin();

  const product = await getAdminProduct();
  const beauty = product === "beauty";
  const inProduct = { brand: product };

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const studios = await db.studio.findMany({
    where: inProduct,
    orderBy: { createdAt: "desc" },
    include: {
      subscription: { select: { status: true, currentPeriodEnd: true } },
      _count: { select: { bookings: true, appointments: true } },
    },
  });
  const ids = studios.map((s) => s.id);

  const [people, lastBookings, lastAppointments, thisMonth, owed] = await Promise.all([
    db.user.groupBy({
      by: ["studioId", "role"],
      where: { studioId: { in: ids }, isActive: true },
      _count: true,
    }),
    beauty
      ? Promise.resolve([])
      : db.booking.groupBy({ by: ["studioId"], where: { studioId: { in: ids } }, _max: { createdAt: true } }),
    beauty
      ? db.appointment.groupBy({ by: ["studioId"], where: { studioId: { in: ids } }, _max: { createdAt: true } })
      : Promise.resolve([]),
    beauty
      ? db.appointment.count({ where: { studioId: { in: ids }, createdAt: { gte: monthStart } } })
      : db.booking.count({ where: { studioId: { in: ids }, createdAt: { gte: monthStart } } }),
    beauty
      ? db.payment.aggregate({
          where: {
            studioId: { in: ids },
            appointmentId: { not: null },
            method: "MERCADO_PAGO",
            status: "APPROVED",
            payoutId: null,
            collectedByStudio: false,
          },
          _sum: { amountCents: true },
        })
      : Promise.resolve(null),
  ]);

  const countFor = (studioId: string, roles: readonly string[]) =>
    people
      .filter((p) => p.studioId === studioId && roles.includes(p.role))
      .reduce((sum, p) => sum + p._count, 0);

  // Last activity per studio, so a dormant tenant is obvious at a glance.
  const lastActive = new Map<string, Date | null>(
    [...lastBookings, ...lastAppointments].map((b) => [b.studioId, b._max.createdAt]),
  );

  const clientTotal = people.filter((p) => p.role === "STUDENT").reduce((sum, p) => sum + p._count, 0);
  const activityTotal = studios.reduce(
    (sum, s) => sum + (beauty ? s._count.appointments : s._count.bookings),
    0,
  );

  const stats = beauty
    ? [
        { label: "Negocios", value: String(studios.length) },
        { label: "Clientas", value: String(clientTotal) },
        { label: "Turnos este mes", value: String(thisMonth) },
        { label: "Señas a transferir", value: formatMoney(owed?._sum.amountCents ?? 0, "UYU", locale) },
      ]
    : [
        { label: "Estudios", value: String(studios.length) },
        { label: "Alumnos activos", value: String(clientTotal) },
        { label: "Reservas totales", value: String(activityTotal) },
        { label: "Reservas este mes", value: String(thisMonth) },
      ];

  // How the product's studios spread across plans, trials that lapsed apart.
  const now = Date.now();
  const planMix = PLAN_ORDER.map((plan) => {
    const on = studios.filter((s) => s.plan === plan);
    return {
      plan,
      count: on.length,
      lapsed: plan === "TRIAL" ? on.filter((s) => s.trialEndsAt && s.trialEndsAt.getTime() < now).length : 0,
    };
  });

  const noun = beauty ? "Negocios" : "Estudios";

  return (
    <>
      <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/40">
        {PRODUCT_LABEL[product]}
      </p>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-[var(--radius-lg)] bg-white/5 px-4 py-3.5">
            <p className="text-[11px] uppercase tracking-wider text-white/40">{stat.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        {planMix.map((p) => (
          <span
            key={p.plan}
            className="rounded-[var(--radius-pill)] border border-white/10 px-3 py-1.5 text-xs text-white/70"
          >
            {planLabel(product, p.plan)}
            <span className="ml-1.5 font-semibold tabular-nums text-white">{p.count}</span>
            {p.lapsed > 0 && <span className="ml-1.5 text-red-300">({p.lapsed} vencidas)</span>}
          </span>
        ))}
      </div>

      <h1 className="mb-3 text-lg font-semibold">{noun}</h1>

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-[11px] uppercase tracking-wider text-white/40">
            <tr>
              <th className="px-4 py-2.5 font-medium">{beauty ? "Negocio" : "Estudio"}</th>
              <th className="px-3 py-2.5 font-medium">Plan</th>
              <th className="px-3 py-2.5 font-medium">{beauty ? "Profesionales" : "Staff"}</th>
              <th className="px-3 py-2.5 font-medium">{beauty ? "Clientas" : "Alumnos"}</th>
              <th className="px-3 py-2.5 font-medium">{beauty ? "Turnos" : "Reservas"}</th>
              <th className="px-3 py-2.5 font-medium">Última actividad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {studios.map((studio) => {
              const trialDays = daysUntil(studio.trialEndsAt);
              const last = lastActive.get(studio.id) ?? null;

              return (
                <tr key={studio.id} className="transition-colors hover:bg-white/5">
                  <td className="px-4 py-3">
                    <Link href={`/admin/studios/${studio.id}`} className="block">
                      <span className="font-medium">{studio.name}</span>
                      {studio.suspendedAt && (
                        <span className="ml-2 rounded-[var(--radius-pill)] bg-red-500/20 px-2 py-0.5 text-[11px] text-red-300">
                          Suspendido
                        </span>
                      )}
                      <span className="block text-xs text-white/40">/{studio.slug}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-white/80">{planLabel(studio.brand, studio.plan)}</span>
                    {studio.subscription?.status === "PAST_DUE" && (
                      <span className="ml-2 rounded-[var(--radius-pill)] bg-red-500/20 px-2 py-0.5 text-[11px] text-red-300">
                        Pago rechazado
                      </span>
                    )}
                    {studio.plan === "TRIAL" && trialDays !== null && (
                      <span className={`block text-xs ${trialDays < 0 ? "text-red-300" : "text-white/40"}`}>
                        {trialDays < 0 ? "vencida" : `${trialDays} días`}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-white/80">{countFor(studio.id, STAFF_ROLES)}</td>
                  <td className="px-3 py-3 tabular-nums text-white/80">{countFor(studio.id, ["STUDENT"])}</td>
                  <td className="px-3 py-3 tabular-nums text-white/80">
                    {beauty ? studio._count.appointments : studio._count.bookings}
                  </td>
                  <td className="px-3 py-3 text-xs text-white/50">
                    {last ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(last) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {studios.length === 0 && (
        <p className="mt-6 text-center text-sm text-white/40">
          Todavía no hay {noun.toLowerCase()} en {PRODUCT_LABEL[product]}.
        </p>
      )}
    </>
  );
}
