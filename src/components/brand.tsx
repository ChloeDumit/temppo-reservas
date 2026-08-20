import { cn } from "@/lib/cn";

/**
 * The TEMPPO mascot, matching temppo.uy exactly.
 *
 * Colours are literal rather than themed: this is the company mark, so it
 * stays constant even when a studio overrides the app's accent colour.
 */
export function Mascot({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      aria-hidden
    >
      {/* Ground shadow */}
      <ellipse cx="50" cy="90" rx="22" ry="5" fill="#C85C35" opacity="0.3" />

      {/* Body */}
      <circle cx="50" cy="50" r="36" fill="#E07A5F" />
      <path d="M22 60 Q50 85 78 60 Q75 78 50 82 Q25 78 22 60Z" fill="#C85C35" />

      {/* Feet */}
      <ellipse cx="37" cy="84" rx="8" ry="5" fill="#E07A5F" />
      <ellipse cx="37" cy="84" rx="8" ry="5" fill="#C85C35" opacity="0.3" />
      <ellipse cx="63" cy="84" rx="8" ry="5" fill="#E07A5F" />
      <ellipse cx="63" cy="84" rx="8" ry="5" fill="#C85C35" opacity="0.3" />

      {/* Eye */}
      <circle cx="55" cy="42" r="12" fill="#FFFFFF" />
      <circle cx="58" cy="43" r="6" fill="#3D2010" />
      <circle cx="60" cy="40" r="2.5" fill="#FFFFFF" />

      {/* Smile */}
      <path
        d="M40 58 Q50 66 60 58"
        stroke="#3D2010"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Tail */}
      <path
        d="M80 50 Q90 42 88 32 Q86 24 78 28"
        stroke="#C85C35"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Blush */}
      <circle cx="38" cy="56" r="4" fill="#C85C35" opacity="0.35" />
    </svg>
  );
}

/**
 * Full lockup: mascot + wordmark, as on temppo.uy, with the product name
 * alongside. The wordmark keeps the brand's own typeface; the rest of the app
 * uses its interface fonts.
 */
export function Brand({ className, subdued }: { className?: string; subdued?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Mascot size={28} />
      <span className="inline-flex items-baseline gap-1.5">
        <span className="font-brand text-xl leading-none text-[#E07A5F]">temppo</span>
        <span
          className={cn(
            "font-sans text-sm font-normal",
            subdued ? "text-muted" : "text-ink-soft",
          )}
        >
          Reservas
        </span>
      </span>
    </span>
  );
}

/** Just the mascot, for avatars and the mobile header. */
export function BrandMark({ className }: { className?: string }) {
  return <Mascot size={32} className={cn("shrink-0", className)} />;
}
