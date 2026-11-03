import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { dateKeyInZone, formatTime } from "@/lib/dates";
import { PRODUCT_LABEL } from "@/lib/admin/product";
import { instagramAccountFor, publishProblem } from "@/lib/content/instagram";
import {
  deleteContentPostAction,
  duplicateContentPostAction,
  markPublishedAction,
  moveMediaAction,
  removeMediaAction,
  saveContentPostAction,
  unscheduleAction,
} from "../actions";
import { MediaUploader } from "../uploader";
import { CopyText } from "../copy-text";
import { KIND_LABEL, STATUS, TZ } from "../labels";

const field = "mt-1 block w-full rounded-[var(--radius-md)] border border-white/15 bg-white/5 px-3 py-2 text-sm text-white";
const pill = "rounded-[var(--radius-pill)] px-4 py-2 text-sm";

export default async function ContentPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const { locale, id } = await params;
  const { m: flash } = await searchParams;
  setRequestLocale(locale);
  await requirePlatformAdmin();

  const post = await db.contentPost.findUnique({ where: { id }, include: { media: { orderBy: { position: "asc" } } } });
  if (!post) notFound();

  const locked = post.status === "PUBLISHED" || post.status === "PUBLISHING";
  const local = post.scheduledAt ? `${dateKeyInZone(post.scheduledAt, TZ)}T${formatTime(post.scheduledAt, TZ, "en-GB")}` : "";
  const problem = post.channel === "INSTAGRAM" ? publishProblem(post) : null;
  const igReady = Boolean(instagramAccountFor(post.brand));
  const hashtags = (post.caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
  const when = (d: Date) => new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short", timeZone: TZ }).format(d);

  return (
    <>
      <Link href="/admin/content" className="text-sm text-white/50 underline underline-offset-4">
        ← Contenido
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{post.title}</h1>
        <span className={`rounded-[var(--radius-pill)] px-2.5 py-0.5 text-xs ${STATUS[post.status].className}`}>{STATUS[post.status].label}</span>
        <span className="text-xs text-white/40">{PRODUCT_LABEL[post.brand === "temppo" ? "temppo" : "beauty"]}</span>
      </div>

      {flash && <p className="mt-4 rounded-[var(--radius-md)] bg-white/10 px-4 py-2.5 text-sm">{flash}</p>}

      {post.status === "SCHEDULED" && post.scheduledAt && (
        <p className="mt-4 rounded-[var(--radius-md)] bg-amber-500/10 px-4 py-2.5 text-sm text-amber-100">
          {post.channel === "INSTAGRAM" ? "Se publica sola el " : "Recordatorio para publicarla a mano el "}
          {when(post.scheduledAt)}.
        </p>
      )}
      {post.status === "PUBLISHING" && (
        <p className="mt-4 rounded-[var(--radius-md)] bg-violet-500/10 px-4 py-2.5 text-sm text-violet-100">
          Instagram está procesando el archivo. Se termina de publicar sola en los próximos minutos.
        </p>
      )}
      {post.status === "PUBLISHED" && (
        <p className="mt-4 rounded-[var(--radius-md)] bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-100">
          Publicada {post.publishedAt ? `el ${when(post.publishedAt)}` : ""}.{" "}
          {post.permalink && (
            <a href={post.permalink} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              Ver en Instagram
            </a>
          )}
        </p>
      )}
      {post.status === "FAILED" && post.error && (
        <p className="mt-4 rounded-[var(--radius-md)] bg-red-500/10 px-4 py-2.5 text-sm text-red-200">No se pudo publicar: {post.error}</p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* ── The post ──────────────────────────────────── */}
        <form action={saveContentPostAction} className="space-y-4">
          <input type="hidden" name="id" value={post.id} />
          <fieldset disabled={locked} className="space-y-4 disabled:opacity-60">
            <label className="block text-xs text-white/40">
              Título (solo para vos)
              <input name="title" defaultValue={post.title} required maxLength={120} className={field} />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs text-white/40">
                Tipo
                <select name="kind" defaultValue={post.kind} className={field}>
                  {Object.entries(KIND_LABEL).map(([v, l]) => (
                    <option key={v} value={v} className="bg-ink">{l}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-white/40">
                Canal
                <select name="channel" defaultValue={post.channel} className={field}>
                  <option value="INSTAGRAM" className="bg-ink">Instagram (automático)</option>
                  <option value="MANUAL" className="bg-ink">A mano (TikTok, o con audio)</option>
                </select>
              </label>
              <label className="block text-xs text-white/40">
                Día y hora (Montevideo)
                <input name="scheduledAt" type="datetime-local" defaultValue={local} className={field} />
              </label>
            </div>
            <label className="block text-xs text-white/40">
              <span className="flex items-center justify-between">
                <span>Caption</span>
                <span className={post.caption.length > 2200 || hashtags > 30 ? "text-red-300" : ""}>
                  {post.caption.length}/2200 · {hashtags}/30 hashtags
                </span>
              </span>
              <textarea name="caption" defaultValue={post.caption} rows={9} maxLength={2200} className={`${field} font-sans leading-relaxed`} />
            </label>
            <label className="block text-xs text-white/40">
              Notas (qué archivo va, ideas, audio…)
              <textarea name="notes" defaultValue={post.notes ?? ""} rows={2} className={field} />
            </label>
          </fieldset>

          {!locked && (
            <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
              <button name="intent" value="schedule" className={`${pill} bg-white font-medium text-ink`}>
                {post.channel === "INSTAGRAM" ? "Programar" : "Agendar recordatorio"}
              </button>
              {post.channel === "INSTAGRAM" && igReady && (
                <button name="intent" value="publish" className={`${pill} bg-[#DE8BA3] font-medium text-ink`}>
                  Publicar ahora
                </button>
              )}
              <button name="intent" value="ready" className={`${pill} bg-white/10 hover:bg-white/20`}>Guardar como lista</button>
              <button name="intent" value="idea" className={`${pill} bg-white/10 hover:bg-white/20`}>Guardar como idea</button>
            </div>
          )}
          {!locked && problem && post.channel === "INSTAGRAM" && (
            <p className="text-xs text-amber-200">Para publicarla en Instagram: {problem}.</p>
          )}
        </form>

        {/* ── Files and the rest ────────────────────────── */}
        <aside className="space-y-5">
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-white/50">
              Archivos {post.kind === "CAROUSEL" && <span className="normal-case tracking-normal text-white/30">(en este orden)</span>}
            </h2>
            <ul className="space-y-2">
              {post.media.map((m, i) => (
                <li key={m.id} className="flex items-center gap-3 rounded-[var(--radius-md)] bg-white/5 p-2">
                  <a href={`/api/content-media/${m.key}`} target="_blank" rel="noreferrer" className="block h-20 w-16 shrink-0 overflow-hidden rounded bg-black/40">
                    {m.isVideo ? (
                      <video src={`/api/content-media/${m.key}`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/content-media/${m.key}`} alt="" className="h-full w-full object-cover" />
                    )}
                  </a>
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="truncate text-white/80">{i + 1}. {m.filename}</p>
                    <p className="text-white/40">{m.isVideo ? "Video" : "Imagen JPEG"} · {m.size < 1024 * 1024 ? `${Math.max(1, Math.round(m.size / 1024))} KB` : `${(m.size / 1024 / 1024).toFixed(1)} MB`}</p>
                    <a href={`/api/content-media/${m.key}`} download={m.filename} className="text-white/50 underline underline-offset-2">Descargar</a>
                  </div>
                  {!locked && (
                    <div className="flex flex-col gap-1">
                      {post.kind === "CAROUSEL" && (
                        <>
                          <form action={moveMediaAction}>
                            <input type="hidden" name="mediaId" value={m.id} />
                            <input type="hidden" name="dir" value="up" />
                            <button className="rounded px-2 text-white/50 hover:bg-white/10 disabled:opacity-20" disabled={i === 0} aria-label="Subir">↑</button>
                          </form>
                          <form action={moveMediaAction}>
                            <input type="hidden" name="mediaId" value={m.id} />
                            <input type="hidden" name="dir" value="down" />
                            <button className="rounded px-2 text-white/50 hover:bg-white/10 disabled:opacity-20" disabled={i === post.media.length - 1} aria-label="Bajar">↓</button>
                          </form>
                        </>
                      )}
                      <form action={removeMediaAction}>
                        <input type="hidden" name="mediaId" value={m.id} />
                        <button className="rounded px-2 text-red-300/70 hover:bg-red-500/20" aria-label="Quitar">✕</button>
                      </form>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {!locked && <div className="mt-2"><MediaUploader postId={post.id} /></div>}
          </section>

          <section className="space-y-2 rounded-[var(--radius-lg)] border border-white/10 p-4">
            <div className="flex flex-wrap gap-2">
              <CopyText value={post.caption} label="Copiar caption" />
              <form action={duplicateContentPostAction}>
                <input type="hidden" name="id" value={post.id} />
                <button className="rounded-[var(--radius-pill)] bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20">Duplicar</button>
              </form>
              {(post.status === "SCHEDULED" || post.status === "FAILED") && (
                <form action={unscheduleAction}>
                  <input type="hidden" name="id" value={post.id} />
                  <button className="rounded-[var(--radius-pill)] bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20">Desprogramar</button>
                </form>
              )}
            </div>
            {post.status !== "PUBLISHED" && (
              <form action={markPublishedAction} className="flex gap-2 pt-2">
                <input type="hidden" name="id" value={post.id} />
                <input name="permalink" placeholder="Link de la publicación (opcional)" className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs" />
                <button className="rounded-[var(--radius-pill)] bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20">La publiqué a mano</button>
              </form>
            )}
            {post.status !== "PUBLISHING" && (
              <form action={deleteContentPostAction} className="pt-2">
                <input type="hidden" name="id" value={post.id} />
                <button className="text-xs text-red-300/70 underline underline-offset-2 hover:text-red-200">
                  Borrar esta publicación{post.status === "PUBLISHED" ? " del calendario (en Instagram queda)" : ""}
                </button>
              </form>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
