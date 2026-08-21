import { cn } from "@/lib/cn";

/**
 * Indeterminate spinner for work whose length is unknown — a form submitting,
 * a scan resolving. Where the shape of the result is known, a skeleton is the
 * better answer, because it holds the layout still instead of replacing it.
 */
export function Spinner({
  className,
  size = 18,
  label,
}: {
  className?: string;
  size?: number;
  /** Announced to screen readers; omit inside a control that already says it. */
  label?: string;
}) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("inline-block shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-full animate-spin-slow">
        {/* The track, then a arc that reads as motion against it. */}
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
