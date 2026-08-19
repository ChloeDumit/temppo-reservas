/** Nudges a hex colour's lightness. Used to derive hover/soft accent shades. */
function shift(hex: string, amount: number, towardsWhite: boolean) {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean.padEnd(6, "0").slice(0, 6);

  const channels = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  const mixed = channels.map((value) => {
    const target = towardsWhite ? 255 : 0;
    return Math.round(value + (target - value) * amount);
  });

  return `#${mixed.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function isValidHex(value: string) {
  return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

export function normalizeHex(value: string, fallback = "#c0563c") {
  if (!isValidHex(value)) return fallback;
  const clean = value.trim().replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  return `#${full.toLowerCase()}`;
}

/** The three CSS variables `.accent-scope` reads. */
export function accentVars(accent: string) {
  const base = normalizeHex(accent);
  return {
    "--studio-accent": base,
    "--studio-accent-hover": shift(base, 0.18, false),
    "--studio-accent-soft": shift(base, 0.88, true),
  } as React.CSSProperties;
}
