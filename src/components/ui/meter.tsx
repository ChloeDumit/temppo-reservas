import { cn } from "@/lib/cn";

/**
 * Occupancy as a ring rather than a fraction.
 *
 * A studio owner scanning a schedule wants "nearly full" or "plenty of room"
 * in one glance; the exact numbers sit inside for when they matter.
 */
export function RingMeter({
  filled,
  total,
  size = 44,
  className,
  label,
}: {
  filled: number;
  total: number;
  size?: number;
  className?: string;
  label?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((filled / total) * 100)) : 0;
  const full = total > 0 && filled >= total;

  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${filled}/${total}`}
    >
      <span
        className={cn("ring-meter absolute inset-0 rounded-full", full && "opacity-90")}
        style={{ ["--pct" as string]: pct }}
        aria-hidden
      />
      {/* Punches the centre out so the ring reads as a ring. */}
      <span
        className="absolute rounded-full bg-surface"
        style={{ inset: Math.max(4, size * 0.14) }}
        aria-hidden
      />
      <span className="relative text-[11px] font-semibold tabular-nums text-ink">
        {filled}
        <span className="text-muted">/{total}</span>
      </span>
    </span>
  );
}
