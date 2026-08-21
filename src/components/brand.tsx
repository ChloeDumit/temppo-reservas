import { cn } from "@/lib/cn";

/**
 * The TEMPPO mascot, matching temppo.uy exactly.
 *
 * Colours are literal rather than themed: this is the company mark, so it
 * stays constant even when a studio overrides the app's accent colour.
 *
 * The same artwork is rasterised into the PWA icon set by scripts/icons.mjs —
 * change one and run `npm run icons` so the two do not drift apart.
 */
export function Mascot({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 240 240"
      fill="none"
      className={className}
      aria-hidden
    >
      {/* The inner offset is part of the artwork: it centres the mascot once
          the calendar card it holds is accounted for. */}
      <g transform="translate(-9,-4)">
        {/* Tail */}
        <path
          d="M170 62 A34 34 0 1 1 174 114"
          fill="none"
          stroke="#D2694A"
          strokeWidth="15"
          strokeLinecap="round"
        />

        {/* Body */}
        <circle cx="110" cy="112" r="88" fill="#DD7C63" />
        <path d="M35 158 Q110 136 185 158 A88 88 0 0 1 35 158 Z" fill="#C75F43" />

        {/* Feet */}
        <ellipse cx="78" cy="192" rx="26" ry="14" fill="#DD7C63" />
        <ellipse cx="146" cy="192" rx="26" ry="14" fill="#DD7C63" />

        {/* Blush */}
        <circle cx="74" cy="104" r="10" fill="#CE6349" opacity="0.55" />

        {/* Eye */}
        <ellipse cx="130" cy="86" rx="29" ry="32" fill="#FFFFFF" />
        <circle cx="134" cy="90" r="18" fill="#4E2317" />
        <circle cx="141" cy="81" r="6" fill="#FFFFFF" />

        {/* Smile */}
        <path
          d="M78 120 Q104 142 130 124"
          fill="none"
          stroke="#4E2317"
          strokeWidth="9"
          strokeLinecap="round"
        />

        {/* The day it is holding — the product in one object. */}
        <g transform="rotate(-7 168 176)">
          <rect x="128" y="139" width="88" height="84" rx="13" fill="#A64A2C" opacity="0.22" />
          <rect x="146" y="126" width="8" height="14" rx="4" fill="#B0512F" />
          <rect x="182" y="126" width="8" height="14" rx="4" fill="#B0512F" />
          <rect x="124" y="134" width="88" height="84" rx="13" fill="#C75F43" />
          <path
            d="M124 154 h88 v51 a13 13 0 0 1 -13 13 h-62 a13 13 0 0 1 -13 -13 z"
            fill="#FFF8F5"
          />
          <text
            x="168"
            y="201"
            textAnchor="middle"
            fontFamily="Nunito, Trebuchet MS, sans-serif"
            fontSize="44"
            fontWeight="800"
            fill="#4E2317"
          >
            17
          </text>
        </g>
      </g>
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
