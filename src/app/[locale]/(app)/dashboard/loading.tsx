import { Skeleton, SkeletonHero, SkeletonRows } from "@/components/ui/skeleton";

/** Mirrors the dashboard: the day's hero, the stat pair, then upcoming. */
export default function DashboardLoading() {
  return (
    <>
      <SkeletonHero />
      <div className="mb-4 grid grid-cols-2 gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="card px-4 py-3.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-7 w-12" />
          </div>
        ))}
      </div>
      <Skeleton className="mb-2 h-3 w-28" />
      <SkeletonRows rows={3} />
    </>
  );
}
