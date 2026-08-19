import { cn } from "@/lib/cn";

/** Wordmark. The dot is the accent, so studio branding tints it automatically. */
export function Brand({ className, subdued }: { className?: string; subdued?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1 font-display text-lg font-semibold tracking-tight",
        subdued ? "text-ink-soft" : "text-ink",
        className,
      )}
    >
      TEMPPO
      <span className="text-accent">·</span>
      <span className="font-sans text-sm font-normal text-muted">Reservas</span>
    </span>
  );
}

/** Square mark for avatars and the mobile header. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-accent font-display text-sm font-bold text-white",
        className,
      )}
      aria-hidden
    >
      T
    </span>
  );
}
