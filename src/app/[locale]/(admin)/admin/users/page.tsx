import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { toggleUserActiveAction } from "../actions";

/** Cross-tenant user search — the "who is this person" lookup. */
export default async function AdminUsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  const { q } = await searchParams;
  setRequestLocale(locale);
  await requirePlatformAdmin();

  const query = (q ?? "").trim();

  const users = await db.user.findMany({
    where: query
      ? {
          OR: [
            { email: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
          ],
        }
      : undefined,
    include: { studio: { select: { id: true, name: true, suspendedAt: true } } },
    orderBy: { createdAt: "desc" },
    // Unbounded would be a footgun once this has real volume.
    take: 100,
  });

  const date = (d: Date) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(d);

  return (
    <>
      <h1 className="mb-3 text-lg font-semibold">Usuarios</h1>

      <form className="mb-5">
        <input
          name="q"
          defaultValue={query}
          placeholder="Buscar por nombre o email"
          className="w-full rounded-[var(--radius-md)] border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30"
        />
      </form>

      <p className="mb-3 text-xs text-white/40">
        {users.length === 100 ? "Primeros 100 resultados" : `${users.length} resultados`}
      </p>

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-white/10">
        <ul className="divide-y divide-white/10">
          {users.map((user) => (
            <li key={user.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  {user.name}
                  {user.isPlatformAdmin && (
                    <span className="ml-2 rounded-[var(--radius-pill)] bg-[#E07A5F]/25 px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#E07A5F]">
                      plataforma
                    </span>
                  )}
                  {!user.isActive && (
                    <span className="ml-2 text-[11px] text-white/40">inactivo</span>
                  )}
                </p>
                <p className="truncate text-xs text-white/40">
                  {user.email} · {user.role} ·{" "}
                  <Link
                    href={`/admin/studios/${user.studio.id}`}
                    className="underline underline-offset-2"
                  >
                    {user.studio.name}
                  </Link>
                  {user.studio.suspendedAt && (
                    <span className="text-red-300"> · estudio suspendido</span>
                  )}
                </p>
              </div>

              <span className="text-xs text-white/30">{date(user.createdAt)}</span>

              <form action={toggleUserActiveAction}>
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="returnTo" value="/admin/users" />
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
      </div>

      {users.length === 0 && (
        <p className="mt-6 text-center text-sm text-white/40">Sin resultados.</p>
      )}
    </>
  );
}
