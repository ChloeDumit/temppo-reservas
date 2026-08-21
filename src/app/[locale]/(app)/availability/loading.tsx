import { Skeleton, SkeletonHeader } from "@/components/ui/skeleton";

/** Cupos fijos: day headings with collapsed slot rows beneath. */
export default function AvailabilityLoading() {
  return (
    <>
      <SkeletonHeader />
      <div className="space-y-6">
        {[0, 1, 2].map((day) => (
          <section key={day}>
            <Skeleton className="mb-2 h-3 w-24" />
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="card flex items-center gap-3 px-4 py-3">
                  <Skeleton className="h-9 w-1 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-44" />
                    <Skeleton className="mt-2 h-2.5 w-32" />
                  </div>
                  <Skeleton className="h-6 w-16 rounded-[var(--radius-pill)]" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
