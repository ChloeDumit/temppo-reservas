import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { BeautyMascot, Mascot } from "@/components/brand";
import { getAdminProduct } from "@/lib/admin/product";
import { ProductSwitch } from "./product-switch";
import { AdminNav } from "./admin-nav";

/**
 * Platform console shell.
 *
 * Deliberately plain and outside the studio app's chrome: this spans every
 * tenant, so borrowing the studio's branding — including its accent colour —
 * would make it easy to forget whose data is on screen.
 */
/** Saved to a phone's home screen from here, it opens the console itself. */
export const metadata: Metadata = {
  manifest: "/admin.webmanifest",
  appleWebApp: { capable: true, title: "Consola", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#1c1917" };

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
    { href: "/admin/content", label: "Contenido" },
    ...(beauty
      ? [
          { href: "/admin/payouts", label: "Señas" },
          { href: "/admin/whatsapp", label: "WhatsApp" },
        ]
      : []),
    { href: "/admin/users", label: "Usuarios" },
  ];

  return (
    <div className="min-h-dvh bg-ink text-white">
      <header className="border-b border-white/10">
        {/*
          On a phone: the mark and "Salir", then the product, then the tabs in
          a strip that scrolls sideways. From md up, all on one line.
        */}
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-3 md:flex-row md:flex-wrap md:items-center md:justify-between md:py-4">
          <div className="flex items-center justify-between gap-3">
            <Link href="/admin" className="flex min-w-0 items-center gap-2.5">
              {beauty ? <BeautyMascot size={28} /> : <Mascot size={28} />}
              <span className={`font-brand text-lg ${beauty ? "text-[#DE8BA3]" : "text-[#E07A5F]"}`}>
                temppo{beauty && <span className="ml-1 font-sans text-sm font-medium">Beauty</span>}
              </span>
              <span className="rounded-[var(--radius-pill)] bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider">
                Consola
              </span>
            </Link>
            <Link href="/dashboard" className="text-sm text-white/70 underline underline-offset-4 md:hidden">
              Salir
            </Link>
          </div>

          <div className="flex min-w-0 flex-col gap-3 text-sm md:flex-row md:items-center md:gap-4">
            <ProductSwitch current={product} />
            <AdminNav tabs={tabs} />
            <span className="hidden truncate text-white/40 lg:inline">{user.email}</span>
            <Link href="/dashboard" className="hidden text-white/70 underline underline-offset-4 md:inline">
              Salir
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-5 sm:py-8">{children}</main>
    </div>
  );
}
