"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/cn";

/** Swaps locale while staying on the current page. */
export function LocaleSwitch() {
  const locale = useLocale();
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="inline-flex rounded-md border border-line p-0.5">
      {routing.locales.map((option) => (
        <button
          key={option}
          type="button"
          disabled={pending || option === locale}
          onClick={() =>
            startTransition(() => {
              router.replace(
                // @ts-expect-error -- pathname is a runtime value, not a literal route
                { pathname, params },
                { locale: option },
              );
            })
          }
          className={cn(
            "rounded-[5px] px-2 py-1 text-xs font-medium uppercase transition-colors",
            option === locale ? "bg-sunken text-ink" : "text-muted hover:text-ink",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
