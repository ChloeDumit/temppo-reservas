import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { dateKeyInZone, wallTimeToUtc } from "@/lib/dates";
import { getAdminProduct, PRODUCT_LABEL } from "@/lib/admin/product";
import { instagramProfile } from "@/lib/content/instagram";
import { createContentPostAction, loadPlanAction } from "./actions";
import { CONTENT_PLANS } from "@/lib/content/plan-noviembre";
import { diagnoseInstagram } from "@/lib/content/instagram";
import { KIND_LABEL, STATUS, TZ } from "./labels";

/**
 * The platform's own content calendar: what goes up on the brand's Instagram,
 * when, and how far each post got. Posts on the Instagram channel publish
 * themselves at their time; manual ones are a reminder with everything ready.
 */
export default async function AdminContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ mes?: string; m?: string }>;
}) {
  const { locale } = await params;
  const { mes, m: flash } = await searchParams;
  setRequestLocale(locale);
  await requirePlatformAdmin();
  const brand = await getAdminProduct();

  const today = dateKeyInZone(new Date(), TZ);
  const month = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : today.slice(0, 7);
  const [y, mo] = month.split("-").map(Number);
  const first = `${month}-01`;
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const from = wallTimeToUtc(first, "00:00", TZ);
  const to = wallTimeToUtc(new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 10), "00:00", TZ);
  const shift = (n: number) => new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7);

  const [inMonth, undated, upcoming, profile] = await Promise.all([
    db.contentPost.findMany({
      where: { brand, scheduledAt: { gte: from, lt: to } },
      orderBy: { scheduledAt: "asc" },
      include: { _count: { select: { media: true } } },
    }),
    db.contentPost.findMany({ where: { brand, scheduledAt: null }, orderBy: { createdAt: "desc" }, include: { _count: { select: { media: true } } } }),
    db.contentPost.findMany({
      where: { brand, status: { not: "PUBLISHED" }, scheduledAt: { gte: wallTimeToUtc(today, "00:00", TZ) } },
      orderBy: { scheduledAt: "asc" },
      take: 8,
      include: { _count: { select: { media: true } } },
    }),
    instagramProfile(brand),
  ]);

  const byDay = new Map<string, typeof inMonth>();
  for (const p of inMonth) {
    const key = dateKeyInZone(p.scheduledAt!, TZ);
    byDay.set(key, [...(byDay.get(key) ?? []), p]);
  }
  // Monday-first grid, padded with the previous month's tail.
  const lead = (new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, mo - 1, 1)));
  const monthName = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
  const time = (d: Date) => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(d);
  const day = (d: Date) => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: TZ }).format(d);
  // A plan's button shows while any of its posts is still missing.
  const loadedTitles = new Set(
    (await db.contentPost.findMany({ where: { brand, title: { in: CONTENT_PLANS.flatMap((p) => p.items.map((i) => i.title)) } }, select: { title: true } })).map((p) => p.title),
  );
  // Only this product's plans, and only the ones not already loaded.
  const pendingPlans = CONTENT_PLANS.filter(
    (p) => p.brand === brand && p.items.some((i) => !loadedTitles.has(i.title)),
  );

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            Contenido <span className="text-base font-normal text-white/40">· {PRODUCT_LABEL[brand]}</span>
          </h1>
          <p className="mt-1 text-sm text-white/40">Lo que se publica en Instagram: se sube solo a la hora programada.</p>
        </div>
        <form action={createContentPostAction}>
          <button type="submit" className="rounded-[var(--radius-pill)] bg-white px-4 py-2 text-sm font-medium text-ink">
            + Nueva publicación
          </button>
        </form>
      </div>

      {flash && <p className="mt-4 rounded-[var(--radius-md)] bg-white/10 px-4 py-2.5 text-sm">{flash}</p>}

      {/*
        Asked for only when something is wrong. Graph answers "Object with ID
        does not exist" for a wrong id, a token that was never granted the
        account, and an Instagram profile that is still personal — all three
        at once — so the console works out which it is rather than repeating
        the sentence.
      */}
      {(!profile || "error" in profile) && <ConnectionHelp brand={brand} />}

      <div className={`mt-5 rounded-[var(--radius-lg)] px-4 py-3 text-sm ${profile && !("error" in profile) ? "bg-emerald-500/10 text-emerald-100" : "bg-amber-500/10 text-amber-100"}`}>
        {profile && !("error" in profile) ? (
          <>Instagram conectado: <b>@{profile.username}</b>. Lo programado en el canal Instagram se publica solo.</>
        ) : profile ? (
          <>Instagram responde con un error: {profile.error}</>
        ) : (
          <>
            Instagram todavía no está conectado: podés planificar y subir archivos, pero no se publica solo. Faltan{" "}
            <code>INSTAGRAM_TOKEN</code> y <code>INSTAGRAM_USER_ID_{brand === "beauty" ? "BEAUTY" : "TEMPPO"}</code> en Netlify (ver DEPLOY.md).
          </>
        )}
      </div>

      {pendingPlans.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {pendingPlans.map((plan) => (
            <form key={plan.id} action={loadPlanAction}>
              <input type="hidden" name="plan" value={plan.id} />
              <button type="submit" className="rounded-[var(--radius-pill)] bg-white/10 px-4 py-2 text-sm hover:bg-white/20">
                Cargar {plan.label.charAt(0).toLowerCase() + plan.label.slice(1)} ({plan.items.length} publicaciones con fecha y caption)
              </button>
            </form>
          ))}
        </div>
      )}

      {/* ── Coming up ─────────────────────────────────────── */}
      <section className="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-white/10">
        <h2 className="border-b border-white/10 bg-white/5 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">Próximas</h2>
        {upcoming.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-white/40">Nada programado de hoy en adelante.</p>
        ) : (
          <ul className="divide-y divide-white/10">
            {upcoming.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/content/${p.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-white/5">
                  <span className="w-28 text-xs tabular-nums text-white/50">
                    {day(p.scheduledAt!)} · {time(p.scheduledAt!)}
                  </span>
                  <span className={`rounded-[var(--radius-pill)] px-2 py-0.5 text-[11px] ${STATUS[p.status].className}`}>{STATUS[p.status].label}</span>
                  <span className="w-full text-sm font-medium sm:w-auto sm:flex-1 sm:truncate">{p.title}</span>
                  <span className="text-xs text-white/40">
                    {KIND_LABEL[p.kind]} · {p.channel === "INSTAGRAM" ? "Instagram" : "a mano"} · {p._count.media ? `${p._count.media} archivo${p._count.media > 1 ? "s" : ""}` : "sin archivos"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Month ─────────────────────────────────────────── */}
      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{monthName}</h2>
          <div className="flex gap-2 text-sm">
            <Link href={`/admin/content?mes=${shift(-1)}`} className="rounded-[var(--radius-pill)] bg-white/10 px-3 py-1 hover:bg-white/20">←</Link>
            <Link href="/admin/content" className="rounded-[var(--radius-pill)] bg-white/10 px-3 py-1 hover:bg-white/20">Hoy</Link>
            <Link href={`/admin/content?mes=${shift(1)}`} className="rounded-[var(--radius-pill)] bg-white/10 px-3 py-1 hover:bg-white/20">→</Link>
          </div>
        </div>
        {/* On a phone, the month as an agenda: seven columns would leave nothing readable. */}
        <ul className="space-y-2 md:hidden">
          {cells.filter((key): key is string => Boolean(key && byDay.get(key)?.length)).map((key) => (
            <li key={key} className={`rounded-[var(--radius-lg)] border px-4 py-3 ${key === today ? "border-[#DE8BA3]/60" : "border-white/10"}`}>
              <p className={`text-xs font-semibold uppercase tracking-wider ${key === today ? "text-[#DE8BA3]" : "text-white/40"}`}>
                {new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`))}
              </p>
              <ul className="mt-2 space-y-1.5">
                {byDay.get(key)!.map((p) => (
                  <li key={p.id}>
                    <Link href={`/admin/content/${p.id}`} className="flex items-center gap-2 text-sm">
                      <span className="tabular-nums text-white/50">{time(p.scheduledAt!)}</span>
                      <span className={`shrink-0 rounded-[var(--radius-pill)] px-2 py-0.5 text-[11px] ${STATUS[p.status].className}`}>{STATUS[p.status].label}</span>
                      <span className="truncate">{p.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {!inMonth.length && <li className="rounded-[var(--radius-lg)] border border-white/10 px-4 py-6 text-center text-sm text-white/40">Nada este mes.</li>}
        </ul>

        <div className="hidden grid-cols-7 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-white/10 bg-white/10 text-xs md:grid">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
            <div key={d} className="bg-ink px-2 py-1.5 text-center text-[11px] uppercase tracking-wider text-white/40">{d}</div>
          ))}
          {cells.map((key, i) =>
            key ? (
              <div key={key} className={`min-h-24 bg-ink p-1.5 ${key === today ? "ring-1 ring-inset ring-[#DE8BA3]" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className={`tabular-nums ${key === today ? "font-semibold text-[#DE8BA3]" : "text-white/40"}`}>{Number(key.slice(8))}</span>
                  <form action={createContentPostAction}>
                    <input type="hidden" name="date" value={key} />
                    <button type="submit" className="rounded px-1 text-white/30 hover:bg-white/10 hover:text-white" aria-label={`Nueva publicación el ${key}`}>+</button>
                  </form>
                </div>
                <div className="mt-1 space-y-1">
                  {(byDay.get(key) ?? []).map((p) => (
                    <Link key={p.id} href={`/admin/content/${p.id}`} className={`block truncate rounded px-1.5 py-1 ${STATUS[p.status].className}`} title={p.title}>
                      {time(p.scheduledAt!)} {p.title}
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <div key={`pad-${i}`} className="bg-ink/60" />
            ),
          )}
        </div>
      </section>

      {/* ── Undated ───────────────────────────────────────── */}
      {undated.length > 0 && (
        <section className="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-white/10">
          <h2 className="border-b border-white/10 bg-white/5 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">Sin fecha</h2>
          <ul className="divide-y divide-white/10">
            {undated.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/content/${p.id}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/5">
                  <span className={`rounded-[var(--radius-pill)] px-2 py-0.5 text-[11px] ${STATUS[p.status].className}`}>{STATUS[p.status].label}</span>
                  <span className="flex-1 truncate">{p.title}</span>
                  <span className="text-xs text-white/40">{KIND_LABEL[p.kind]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** What is actually wrong with the Instagram connection, and the ids to use. */
async function ConnectionHelp({ brand }: { brand: string }) {
  const diagnosis = await diagnoseInstagram(brand);
  if (diagnosis.findings.length === 0 && diagnosis.reachable.length === 0) return null;

  return (
    <div className="mt-5 rounded-[var(--radius-lg)] border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-100">
      <p className="font-medium">Diagnóstico de la conexión</p>

      {diagnosis.findings.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-100/90">
          {diagnosis.findings.map((finding) => (
            <li key={finding}>{finding}</li>
          ))}
        </ul>
      )}

      {diagnosis.scopes && (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-wider text-amber-100/60">Permisos del token</p>
          <p className="mt-1 flex flex-wrap gap-1.5">
            {[...new Set([...diagnosis.scopes, ...diagnosis.missingScopes])].sort().map((scope) => {
              const missing = diagnosis.missingScopes.includes(scope);
              return (
                <code
                  key={scope}
                  className={
                    missing
                      ? "rounded bg-red-500/25 px-1.5 py-0.5 text-[13px] text-red-100 line-through"
                      : "rounded bg-black/30 px-1.5 py-0.5 text-[13px]"
                  }
                >
                  {scope}
                </code>
              );
            })}
          </p>
          {diagnosis.expiresAt && (
            <p className="mt-1.5 text-xs text-amber-100/60">
              Vence el {diagnosis.expiresAt.toLocaleDateString("es-UY")}.
            </p>
          )}
        </div>
      )}

      {diagnosis.reachable.length > 0 && (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-wider text-amber-100/60">
            Cuentas que alcanza este token
          </p>
          <ul className="mt-1 space-y-1">
            {diagnosis.reachable.map((account) => (
              <li key={account.igId} className="flex flex-wrap items-baseline gap-x-2">
                <code className="rounded bg-black/30 px-1.5 py-0.5 text-[13px]">{account.igId}</code>
                <span>@{account.username}</span>
                <span className="text-amber-100/60">· {account.pageName}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
