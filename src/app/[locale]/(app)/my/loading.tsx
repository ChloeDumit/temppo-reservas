import { Skeleton, SkeletonHero, SkeletonRows } from "@/components/ui/skeleton";

/** Mirrors Mis clases: next-class hero, packs, then upcoming. */
export default function MyLoading() {
  return (
    <>
      <SkeletonHero />
      <Skeleton className="mb-2 h-3 w-24" />
      <SkeletonRows rows={2} className="mb-4" />
      <SkeletonRows rows={3} />
    </>
  );
}
