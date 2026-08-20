"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { Sheet } from "@/components/ui/sheet";
import { LocaleSwitch } from "./locale-switch";
import { LogoutButton } from "./logout-button";
import { ReplayTourButton } from "./guided-tour";
import type { NavItem } from "./nav-items";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav className="space-y-0.5">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-accent-soft font-medium text-accent-ink"
                : "text-ink-soft hover:bg-sunken hover:text-ink",
            )}
          >
            <Icon name={item.icon} className="size-[18px]" />
            {t(item.label)}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Phone navigation: four destinations plus "More".
 *
 * Everything the tab bar can't hold lives one tap away in a sheet, so no
 * section of the app is stranded off-screen on a phone.
 */
export function MobileTabBar({
  primary,
  overflow,
  user,
}: {
  primary: NavItem[];
  overflow: NavItem[];
  user: { name: string; email: string; roleLabel: string };
}) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const [moreOpen, setMoreOpen] = useState(false);

  const hasOverflow = overflow.length > 0;
  const overflowActive = overflow.some((item) => isActive(pathname, item.href));

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md lg:hidden">
        <div className="flex pb-nav-safe">
          {primary.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                data-tour={`tab:${item.href}`}
                className={cn(
                  "pressable flex flex-1 flex-col items-center gap-1 pt-2.5 text-[10px] font-medium",
                  active ? "text-accent" : "text-muted",
                )}
              >
                <Icon name={item.icon} className="size-6" />
                <span className="max-w-full truncate px-0.5">{t(item.label)}</span>
              </Link>
            );
          })}

          {/*
            Always rendered, even when there is no overflow: this sheet is the
            only place on a phone that holds the account details, language and
            log out. Students have few enough destinations to fit the bar, and
            without this they had no way to sign out.
          */}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-expanded={moreOpen}
            data-tour="tab:more"
            className={cn(
              "pressable flex flex-1 flex-col items-center gap-1 pt-2.5 text-[10px] font-medium",
              overflowActive ? "text-accent" : "text-muted",
            )}
          >
            <Icon name={hasOverflow ? "more" : "users"} className="size-6" />
            <span>{hasOverflow ? t("more") : t("account")}</span>
          </button>
        </div>
      </nav>

      <Sheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title={hasOverflow ? t("more") : t("account")}
      >
        <ul className="divide-y divide-line">
          {overflow.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "pressable-row flex items-center gap-3.5 py-3.5 text-[15px]",
                    active ? "font-medium text-accent" : "text-ink",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg",
                      active ? "bg-accent-soft text-accent-ink" : "bg-sunken text-ink-soft",
                    )}
                  >
                    <Icon name={item.icon} className="size-[18px]" />
                  </span>
                  <span className="flex-1">{t(item.label)}</span>
                  <Icon name="chevronRight" className="size-4 text-muted" />
                </Link>
              </li>
            );
          })}
        </ul>

        <div className={cn("rounded-lg bg-sunken px-4 py-3.5", hasOverflow && "mt-5")}>
          <p className="truncate text-sm font-medium text-ink">{user.name}</p>
          <p className="truncate text-xs text-muted">{user.email}</p>
          <p className="mt-1 text-xs text-muted">{user.roleLabel}</p>
        </div>

        <div className="mt-3 border-t border-line pt-3">
          <ReplayTourButton label={t("replayTour")} />
        </div>

        <div className="mt-1 flex items-center justify-between gap-3">
          <LocaleSwitch />
          <LogoutButton />
        </div>
      </Sheet>
    </>
  );
}
