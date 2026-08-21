import { Skeleton, SkeletonHeader } from "@/components/ui/skeleton";

/** Students are avatar rows, so the circles need to be there too. */
export default function StudentsLoading() {
  return (
    <>
      <SkeletonHeader />
      <Skeleton className="mb-4 h-12 w-full rounded-[var(--radius-md)]" />
      <div className="card overflow-hidden">
        <ul className="divide-y divide-line">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <Skeleton className="size-10 rounded-full" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-2 h-3 w-40" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
