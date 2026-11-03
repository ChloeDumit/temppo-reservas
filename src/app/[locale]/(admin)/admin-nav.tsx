"use client";

import { useEffect, useRef } from "react";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * The console's tabs. On a phone they don't fit across, so they scroll
 * sideways in one strip, with the current one marked and brought into view.
 */
export function AdminNav({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const strip = useRef<HTMLElement>(null);
  // The longest matching prefix: /admin/content/123 is Contenido, not Estudios.
  const current = tabs
    .filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  useEffect(() => {
    strip.current?.querySelector<HTMLElement>("[aria-current=page]")?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [current]);

  return (
    <nav
      ref={strip}
      className="-mx-5 flex gap-1 overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.href === current ? "page" : undefined}
          className={`shrink-0 whitespace-nowrap rounded-[var(--radius-pill)] px-3 py-1.5 transition-colors ${
            tab.href === current ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
