import { Skeleton, SkeletonHeader } from "@/components/ui/skeleton";

/** The week reads as day headings with class cards under each. */
export default function ScheduleLoading() {
  return (
    <>
      <SkeletonHeader />
      <div className="space-y-6">
        {[0, 1, 2].map((day) => (
          <section key={day}>
            <Skeleton className="mb-2 h-3 w-20" />
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="card flex items-center gap-3 px-4 py-3.5">
                  <Skeleton className="h-9 w-1 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="mt-2 h-3 w-28" />
                  </div>
                  <Skeleton className="h-4 w-8" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
