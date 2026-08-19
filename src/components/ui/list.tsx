import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/app/icon";

/** Grouped list container — rounded card holding a run of rows. */
export function List({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("card overflow-hidden", className)}>
      <ul className="divide-y divide-line">{children}</ul>
    </div>
  );
}

/**
 * A tappable row. Comfortably above the 44pt minimum, with a chevron so it
 * reads as navigable rather than decorative.
 */
export function ListRow({
  href,
  leading,
  title,
  subtitle,
  trailing,
  chevron = true,
}: {
  href?: string;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
}) {
  const inner = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium text-ink">{title}</div>
        {subtitle && <div className="mt-0.5 truncate text-xs text-muted">{subtitle}</div>}
      </div>
      {trailing}
      {href && chevron && (
        <Icon name="chevronRight" className="size-4 shrink-0 text-muted" />
      )}
    </>
  );

  const className =
    "pressable-row flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left sm:px-5";

  return (
    <li>
      {href ? (
        <Link href={href} className={className}>
          {inner}
        </Link>
      ) : (
        <div className={className}>{inner}</div>
      )}
    </li>
  );
}
