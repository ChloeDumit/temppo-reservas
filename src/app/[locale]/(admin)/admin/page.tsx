import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";

/** Days until a trial ends. Negative once it has lapsed. */
function daysUntil(date: Date | null) {
  if (!date) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

export default async function AdminStudiosPage({
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

  const [studios, totals, bookingsThisMonth] = await Promise.all([
    db.studio.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        subscription: { select: { status: true, currentPeriodEnd: true } },
        _count: {
          select: {
            users: true,
            classInstances: true,
            bookings: true,
          },
        },
      },
    }),
    Promise.all([
      db.studio.count(),
      db.user.count({ where: { role: "STUDENT", isActive: true } }),
      db.booking.count(),
    ]),
    db.booking.count({ where: { createdAt: { gte: monthStart } } }),
  ]);

  const [studioCount, studentCount, bookingCount] = totals;

  // Last activity per studio, so a dormant tenant is obvious at a glance.
  const lastBookings = await db.booking.groupBy({
    by: ["studioId"],
    _max: { createdAt: true },
  });
  const lastActive = new Map(lastBookings.map((b) => [b.studioId, b._max.createdAt]));

  const stats = [
    { label: "Estudios", value: studioCount },
    { label: "Alumnos activos", value: studentCount },
    { label: "Reservas totales", value: bookingCount },
    { label: "Reservas este mes", value: bookingsThisMonth },
  ];

  return (
    <>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-[var(--radius-lg)] bg-white/5 px-4 py-3.5">
            <p className="text-[11px] uppercase tracking-wider text-white/40">{stat.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>

      <h1 className="mb-3 text-lg font-semibold">Estudios</h1>

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-[11px] uppercase tracking-wider text-white/40">
            <tr>
              <th className="px-4 py-2.5 font-medium">Estudio</th>
              <th className="px-3 py-2.5 font-medium">Plan</th>
              <th className="px-3 py-2.5 font-medium">Usuarios</th>
              <th className="px-3 py-2.5 font-medium">Reservas</th>
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
                    <span className="text-white/80">{studio.plan}</span>
                    {studio.subscription?.status === "PAST_DUE" && (
                      <span className="ml-2 rounded-[var(--radius-pill)] bg-red-500/20 px-2 py-0.5 text-[11px] text-red-300">
                        Pago rechazado
                      </span>
                    )}
                    {studio.plan === "TRIAL" && trialDays !== null && (
                      <span
                        className={`block text-xs ${
                          trialDays < 0 ? "text-red-300" : "text-white/40"
                        }`}
                      >
                        {trialDays < 0 ? "vencida" : `${trialDays} días`}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 tabular-nums text-white/80">{studio._count.users}</td>
                  <td className="px-3 py-3 tabular-nums text-white/80">
                    {studio._count.bookings}
                  </td>
                  <td className="px-3 py-3 text-xs text-white/50">
                    {last
                      ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(last)
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {studios.length === 0 && (
        <p className="mt-6 text-center text-sm text-white/40">Todavía no hay estudios.</p>
      )}
    </>
  );
}
