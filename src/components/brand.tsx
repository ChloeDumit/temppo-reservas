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

/**
 * Temppo Beauty's mascot: TEMPPO's character in the beauty palette, with
 * lashes, eyeliner and painted toenails, still holding the calendar that ties
 * it to the family. Literal colours, like TEMPPO's: it is the company mark.
 *
 * Rasterised into public/beauty/ by scripts/icons.mjs — change both together
 * and run `npm run icons`.
 */
export function BeautyMascot({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 240 240" fill="none" className={className} aria-hidden>
      <g transform="translate(-9,-4)">
        <path d="M170 62 A34 34 0 1 1 174 114" fill="none" stroke="#C76A86" strokeWidth="15" strokeLinecap="round" />
        <circle cx="110" cy="112" r="88" fill="#DE8BA3" />
        <path d="M35 158 Q110 136 185 158 A88 88 0 0 1 35 158 Z" fill="#C46A86" />
        <ellipse cx="78" cy="192" rx="26" ry="14" fill="#DE8BA3" />
        <ellipse cx="146" cy="192" rx="26" ry="14" fill="#DE8BA3" />

        {/* Painted toenails */}
        <g fill="#9E2F52">
          <ellipse cx="66" cy="197" rx="5" ry="4" />
          <ellipse cx="78" cy="199" rx="5.5" ry="4.2" />
          <ellipse cx="90" cy="197" rx="5" ry="4" />
          <ellipse cx="134" cy="197" rx="5" ry="4" />
          <ellipse cx="146" cy="199" rx="5.5" ry="4.2" />
          <ellipse cx="158" cy="197" rx="5" ry="4" />
        </g>

        <circle cx="74" cy="104" r="11" fill="#E8657F" opacity="0.45" />

        {/* Lashes, then the eye with its liner */}
        <g stroke="#3B1622" strokeWidth="6.5" strokeLinecap="round" fill="none">
          <path d="M108 66 Q101 58 97 50" />
          <path d="M121 57 Q118 47 117 38" />
          <path d="M137 55 Q139 45 142 37" />
          <path d="M151 62 Q158 54 164 48" />
        </g>
        <ellipse cx="130" cy="86" rx="29" ry="32" fill="#FFFFFF" />
        <path d="M101 80 Q130 50 159 80" fill="none" stroke="#3B1622" strokeWidth="5" strokeLinecap="round" />
        <circle cx="134" cy="91" r="18" fill="#3B1622" />
        <circle cx="141" cy="82" r="6" fill="#FFFFFF" />

        <path d="M78 120 Q104 142 130 124" fill="none" stroke="#3B1622" strokeWidth="9" strokeLinecap="round" />

        <g transform="rotate(-7 168 176)">
          <rect x="128" y="139" width="88" height="84" rx="13" fill="#3B1622" opacity="0.2" />
          <rect x="146" y="126" width="8" height="14" rx="4" fill="#3B1622" />
          <rect x="182" y="126" width="8" height="14" rx="4" fill="#3B1622" />
          <rect x="124" y="134" width="88" height="84" rx="13" fill="#B5536F" />
          <path d="M124 154 h88 v51 a13 13 0 0 1 -13 13 h-62 a13 13 0 0 1 -13 -13 z" fill="#FFF8FA" />
          <text
            x="168"
            y="201"
            textAnchor="middle"
            fontFamily="Nunito, Trebuchet MS, sans-serif"
            fontSize="44"
            fontWeight="800"
            fill="#3B1622"
          >
            17
          </text>
        </g>
      </g>
    </svg>
  );
}

/** Temppo Beauty's lockup: the mascot beside the name in the brand serif. */
export function BeautyWordmark({
  name,
  className,
  subdued,
  mascot = true,
  mascotSize,
}: {
  name: string;
  className?: string;
  subdued?: boolean;
  /** Leave the mascot out where it would repeat one already on screen. */
  mascot?: boolean;
  mascotSize?: number;
}) {
  const sized = /\btext-(xs|sm|base|lg|xl|\dxl)\b/.test(className ?? "");
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {mascot && <BeautyMascot size={mascotSize ?? (subdued ? 22 : 30)} className="shrink-0" />}
      <span
        className={cn(
          "font-brand leading-none",
          // A size passed in replaces the default rather than fighting it.
          !sized && "text-lg",
          subdued ? "text-muted" : "text-accent",
        )}
      >
        {name}
      </span>
    </span>
  );
}
