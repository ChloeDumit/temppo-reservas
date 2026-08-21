import { Mascot } from "@/components/brand";

/**
 * App boot screen.
 *
 * Covers the gap before any layout has rendered — a cold start, or launching
 * the installed app from the home screen, where the alternative is a blank
 * white rectangle. Deliberately quiet: the mascot on the paper background, so
 * it reads as the app opening rather than something loading.
 */
export default function BootLoading() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-paper">
      <span className="animate-pulse-soft">
        <Mascot size={64} />
      </span>
      <span className="font-brand text-xl text-[#E07A5F]">temppo</span>
    </div>
  );
}
