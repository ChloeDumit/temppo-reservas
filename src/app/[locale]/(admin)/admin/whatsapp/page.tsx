import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { addMonths } from "@/lib/dates";
import { readWhatsAppPayload, type WhatsAppDelivery } from "@/lib/notifications/whatsapp-log";
import { whatsAppSpendSince } from "@/lib/notifications/whatsapp-stats";
import { WHATSAPP_TEMPLATES, type WhatsAppTemplateKey } from "@/lib/notifications/whatsapp-templates";

/**
 * Every automatic WhatsApp the platform sent: to whom, for which studio, the
 * text she read and how far it got. Each message costs us, and they all go
 * out from one number, so this is where a problem shows up first.
 */

const PAGE = 50;

const DELIVERY: Record<WhatsAppDelivery, { label: string; className: string }> = {
  sent: { label: "Enviado", className: "bg-white/10 text-white/70" },
  delivered: { label: "Entregado", className: "bg-sky-500/20 text-sky-200" },
  read: { label: "Leído", className: "bg-emerald-500/20 text-emerald-200" },
  failed: { label: "Falló", className: "bg-red-500/20 text-red-300" },
};

const CATEGORY: Record<string, string> = { UTILITY: "Utilidad", MARKETING: "Marketing", AUTHENTICATION: "Autenticación", SERVICE: "Servicio" };

function formatPhone(digits: string) {
  return digits.startsWith("598") && digits.length === 11
    ? `0${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`
    : `+${digits}`;
}

export default async function AdminWhatsAppPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ studio?: string; estado?: string; page?: string }>;
}) {
  const { locale } = await params;
  const { studio: studioFilter, estado, page: pageParam } = await searchParams;
  setRequestLocale(locale);
  await requirePlatformAdmin();

  const page = Math.max(0, Number(pageParam) || 0);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const delivery = estado && estado in DELIVERY ? (estado as WhatsAppDelivery) : null;
  const where: Prisma.NotificationLogWhereInput = {
    channel: "WHATSAPP",
    ...(studioFilter ? { studioId: studioFilter } : {}),
    ...(delivery === "failed" ? { status: "FAILED" } : {}),
    ...(delivery && delivery !== "failed" ? { status: "SENT", payload: { path: ["delivery"], equals: delivery } } : {}),
  };

  const [logs, total, monthByStudio, monthFailed, studios, spend] = await Promise.all([
    db.notificationLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: page * PAGE, take: PAGE }),
    db.notificationLog.count({ where }),
    db.notificationLog.groupBy({
      by: ["studioId"],
      where: { channel: "WHATSAPP", status: "SENT", createdAt: { gte: monthStart } },
      _count: true,
    }),
    db.notificationLog.count({ where: { channel: "WHATSAPP", status: "FAILED", createdAt: { gte: monthStart } } }),
    db.studio.findMany({
      where: { OR: [{ waMode: "CLOUD" }, { notifications: { some: { channel: "WHATSAPP" } } }] },
      select: { id: true, name: true, waMode: true, waMonthlyQuota: true, waSentThisPeriod: true, waPeriodStart: true },
      orderBy: { name: "asc" },
    }),
    whatsAppSpendSince(monthStart),
  ]);

  // Who each message was for: the client on the appointment it is about.
  const apptIds = logs.filter((l) => l.relatedType === "Appointment" && l.relatedId).map((l) => l.relatedId!);
  const appts = apptIds.length
    ? await db.appointment.findMany({
        where: { id: { in: apptIds } },
        select: { id: true, serviceName: true, client: { select: { user: { select: { name: true } } } } },
      })
    : [];
  const apptOf = new Map(appts.map((a) => [a.id, a]));
  const studioName = new Map(studios.map((s) => [s.id, s.name]));

  const sentThisMonth = monthByStudio.reduce((sum, s) => sum + s._count, 0);
  const sentBy = new Map(monthByStudio.map((s) => [s.studioId, s._count]));
  const usd = (n: number) => `US$ ${n.toFixed(2)}`;
  const date = (d: Date) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short", timeZone: "America/Montevideo" }).format(d);

  const facts = [
    { label: "Enviados este mes", value: String(spend?.messages ?? sentThisMonth) },
    { label: "Costo del mes", value: spend ? usd(spend.costUsd) : "—" },
    { label: "Fallidos este mes", value: String(monthFailed) },
    { label: "Negocios con WhatsApp", value: String(studios.filter((s) => s.waMode === "CLOUD").length) },
  ];

  const filterHref = (next: { studio?: string | null; estado?: string | null; page?: number }) => {
    const q = new URLSearchParams();
    const s = next.studio === undefined ? studioFilter : next.studio;
    const e = next.estado === undefined ? estado : next.estado;
    if (s) q.set("studio", s);
    if (e) q.set("estado", e);
    if (next.page) q.set("page", String(next.page));
    const qs = q.toString();
    return `/admin/whatsapp${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <h1 className="text-2xl font-semibold">WhatsApp</h1>
      <p className="mt-1 text-sm text-white/40">
        Los avisos automáticos que salieron desde el número de Temppo, con el texto que recibió cada clienta.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {facts.map((fact) => (
          <div key={fact.label} className="rounded-[var(--radius-lg)] bg-white/5 px-4 py-3.5">
            <p className="text-[11px] uppercase tracking-wider text-white/40">{fact.label}</p>
            <p className="mt-1 font-display text-xl font-semibold tabular-nums">{fact.value}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-white/30">
        {spend
          ? `Según Meta${spend.byCategory.length ? `: ${spend.byCategory.map((c) => `${CATEGORY[c.category] ?? c.category} ${c.messages} (${usd(c.costUsd)})`).join(" · ")}` : ""}. Se actualiza cada unos minutos.`
          : "Meta no respondió: el total sale del registro de la app y el costo no está disponible."}
        {spend?.byCategory.some((c) => c.category === "MARKETING") && (
          <span className="text-amber-200"> Hay mensajes cobrados como marketing: revisá las plantillas.</span>
        )}
      </p>

      {/* ── Per studio ─────────────────────────────────────── */}
      <section className="mt-8 overflow-x-auto rounded-[var(--radius-lg)] border border-white/10">
        <h2 className="border-b border-white/10 bg-white/5 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
          Por negocio, este mes
        </h2>
        {studios.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-white/40">Ningún negocio tiene WhatsApp automático todavía.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-white/40">
              <tr>
                <th className="px-4 py-2 font-medium">Negocio</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Enviados</th>
                <th className="px-3 py-2 font-medium">Cupo usado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {studios.map((s) => {
                const current = s.waPeriodStart && addMonths(s.waPeriodStart, 1) > new Date();
                const used = current ? s.waSentThisPeriod : 0;
                const pct = s.waMonthlyQuota ? Math.round((used / s.waMonthlyQuota) * 100) : 0;
                return (
                  <tr key={s.id}>
                    <td className="px-4 py-2.5">
                      <Link href={filterHref({ studio: s.id, page: 0 })} className="font-medium hover:underline">
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-white/60">{s.waMode === "CLOUD" ? "Activo" : "Apagado"}</td>
                    <td className="px-3 py-2.5 tabular-nums">{sentBy.get(s.id) ?? 0}</td>
                    <td className={`px-3 py-2.5 tabular-nums ${pct >= 90 ? "text-red-300" : "text-white/60"}`}>
                      {s.waMonthlyQuota ? `${used} de ${s.waMonthlyQuota} (${pct}%)` : "sin cupo"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Messages ───────────────────────────────────────── */}
      <div className="mt-8 flex flex-wrap items-center gap-2 text-sm">
        <span className="mr-1 text-white/40">Estado:</span>
        {[null, ...(Object.keys(DELIVERY) as WhatsAppDelivery[])].map((key) => (
          <Link
            key={key ?? "all"}
            href={filterHref({ estado: key, page: 0 })}
            className={`rounded-[var(--radius-pill)] px-3 py-1 ${
              (estado ?? null) === key ? "bg-white text-ink" : "bg-white/10 text-white/70 hover:bg-white/20"
            }`}
          >
            {key ? DELIVERY[key].label : "Todos"}
          </Link>
        ))}
        {studioFilter && (
          <Link href={filterHref({ studio: null, page: 0 })} className="ml-2 text-white/50 underline underline-offset-4">
            {studioName.get(studioFilter) ?? "Negocio"} ✕
          </Link>
        )}
      </div>

      <section className="mt-3 overflow-hidden rounded-[var(--radius-lg)] border border-white/10">
        {logs.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-white/40">No hay mensajes con este filtro.</p>
        ) : (
          <ul className="divide-y divide-white/10">
            {logs.map((log) => {
              const payload = readWhatsAppPayload(log.payload);
              const state: WhatsAppDelivery = log.status === "FAILED" ? "failed" : (payload?.delivery ?? "sent");
              const appt = log.relatedId ? apptOf.get(log.relatedId) : undefined;
              const label = WHATSAPP_TEMPLATES[log.template as WhatsAppTemplateKey]?.label.es ?? log.template;
              return (
                <li key={log.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={`rounded-[var(--radius-pill)] px-2 py-0.5 text-[11px] ${DELIVERY[state].className}`}>
                      {DELIVERY[state].label}
                    </span>
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-xs text-white/40">
                      {appt?.client.user.name ?? "—"} · {formatPhone(log.recipient)} ·{" "}
                      <Link href={`/admin/studios/${log.studioId}`} className="underline underline-offset-2">
                        {studioName.get(log.studioId) ?? "negocio"}
                      </Link>
                    </span>
                    <span className="ml-auto text-xs tabular-nums text-white/30">{date(log.createdAt)}</span>
                  </div>
                  {payload ? (
                    <p className="mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-white/5 px-3 py-2 text-sm text-white/80">
                      {payload.text}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-white/30">Enviado antes de que se guardara el texto.</p>
                  )}
                  {(log.error || payload?.readAt || payload?.deliveredAt) && (
                    <p className={`mt-1.5 text-xs ${log.error ? "text-red-300" : "text-white/40"}`}>
                      {log.error
                        ? log.error
                        : payload?.readAt
                          ? `Leído ${date(new Date(payload.readAt))}`
                          : `Entregado ${date(new Date(payload!.deliveredAt!))}`}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {total > PAGE && (
        <div className="mt-4 flex items-center justify-between text-sm text-white/50">
          <span>
            {page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} de {total}
          </span>
          <div className="flex gap-2">
            {page > 0 && (
              <Link href={filterHref({ page: page - 1 })} className="rounded-[var(--radius-pill)] bg-white/10 px-3 py-1 hover:bg-white/20">
                ← Anteriores
              </Link>
            )}
            {(page + 1) * PAGE < total && (
              <Link href={filterHref({ page: page + 1 })} className="rounded-[var(--radius-pill)] bg-white/10 px-3 py-1 hover:bg-white/20">
                Siguientes →
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
