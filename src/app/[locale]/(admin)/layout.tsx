import type { ReactNode } from "react";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { BeautyMascot, Mascot } from "@/components/brand";
import { getAdminProduct } from "@/lib/admin/product";
import { ProductSwitch } from "./product-switch";

/**
 * Platform console shell.
 *
 * Deliberately plain and outside the studio app's chrome: this spans every
 * tenant, so borrowing the studio's branding — including its accent colour —
 * would make it easy to forget whose data is on screen.
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePlatformAdmin();
  const product = await getAdminProduct();
  const beauty = product === "beauty";

  // Deposits held for businesses only exist on the appointments product.
  const tabs = [
    { href: "/admin", label: beauty ? "Negocios" : "Estudios" },
    { href: "/admin/payments", label: "Cobros" },
    ...(beauty ? [{ href: "/admin/payouts", label: "Señas" }] : []),
    { href: "/admin/users", label: "Usuarios" },
  ];

  return (
    <div className="min-h-dvh bg-ink text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <Link href="/admin" className="flex items-center gap-2.5">
            {beauty ? <BeautyMascot size={28} /> : <Mascot size={28} />}
            <span className={`font-brand text-lg ${beauty ? "text-[#DE8BA3]" : "text-[#E07A5F]"}`}>
              temppo{beauty && <span className="ml-1 font-sans text-sm font-medium">Beauty</span>}
            </span>
            <span className="rounded-[var(--radius-pill)] bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider">
              Consola
            </span>
          </Link>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <ProductSwitch current={product} />
            <nav className="flex gap-1">
              {tabs.map((tab) => (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className="rounded-[var(--radius-pill)] px-3 py-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                  {tab.label}
                </Link>
              ))}
            </nav>
            <span className="text-white/40">{user.email}</span>
            <Link href="/dashboard" className="text-white/70 underline underline-offset-4">
              Salir
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
    </div>
  );
}
