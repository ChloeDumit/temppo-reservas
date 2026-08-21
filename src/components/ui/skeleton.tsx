import { cn } from "@/lib/cn";

/**
 * Placeholder block.
 *
 * Skeletons are laid out to match what replaces them, so the page does not
 * jump when the data lands. A generic spinner in the middle of the screen
 * would be less work and worse — it tells you nothing about what is coming.
 */
export function Skeleton({ className }: { className?: string }) {
  return <span className={cn("block animate-pulse-soft rounded-md bg-sunken", className)} />;
}

/** The blush hero that opens the dashboard and Mis clases. */
export function SkeletonHero() {
  return (
    <div className="card-feature mb-4 px-5 py-5">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="mt-2.5 h-7 w-44" />
      <div className="mt-4 rounded-[var(--radius-lg)] bg-surface px-4 py-3.5 shadow-soft">
        <div className="flex items-center gap-3">
          <Skeleton className="h-11 w-1.5 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
          <Skeleton className="size-12 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/** A card holding a run of rows, as most lists in the app are. */
export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("card overflow-hidden", className)}>
      <ul className="divide-y divide-line">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
            <Skeleton className="h-9 w-1 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-2 h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-10" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Page title and subtitle, so the header does not pop in late. */
export function SkeletonHeader() {
  return (
    <div className="mb-5">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="mt-2 h-4 w-56" />
    </div>
  );
}
