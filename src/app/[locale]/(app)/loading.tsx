import { SkeletonHeader, SkeletonRows } from "@/components/ui/skeleton";

/**
 * Fallback for any app screen without its own. Header plus a list covers the
 * shape of most of them, so the page settles rather than jumps.
 */
export default function AppLoading() {
  return (
    <>
      <SkeletonHeader />
      <SkeletonRows rows={5} />
    </>
  );
}
