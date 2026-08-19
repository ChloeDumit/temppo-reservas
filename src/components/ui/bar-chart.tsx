import { cn } from "@/lib/cn";

export type Bar = { label: string; value: number; caption?: string };

/**
 * Small inline SVG column chart. No charting library — this is a handful of
 * rects and the page stays fast.
 */
export function BarChart({
  bars,
  formatValue,
  emptyLabel,
  className,
}: {
  bars: Bar[];
  formatValue: (value: number) => string;
  emptyLabel: string;
  className?: string;
}) {
  const max = Math.max(...bars.map((bar) => bar.value), 0);

  if (bars.length === 0 || max === 0) {
    return <p className="px-1 py-6 text-center text-sm text-muted">{emptyLabel}</p>;
  }

  return (
    <div className={cn("scroll-x", className)}>
      <div
        className="flex min-w-full items-end gap-2"
        style={{ minWidth: `${bars.length * 44}px` }}
        role="img"
        aria-label={bars.map((b) => `${b.label}: ${formatValue(b.value)}`).join("; ")}
      >
        {bars.map((bar) => {
          const height = max > 0 ? Math.max(2, Math.round((bar.value / max) * 100)) : 2;
          return (
            <div key={bar.label} className="flex min-w-10 flex-1 flex-col items-center gap-1.5">
              <span className="text-[10px] tabular-nums text-muted">
                {bar.value > 0 ? formatValue(bar.value) : ""}
              </span>
              <div
                className="w-full rounded-t-sm bg-accent/85 transition-[height]"
                style={{ height: `${height}px` }}
                title={`${bar.label}: ${formatValue(bar.value)}`}
              />
              <span className="text-[10px] text-muted">{bar.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
