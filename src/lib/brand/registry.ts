/**
 * The products sold from this codebase. Each brand is its own domain, name,
 * palette and sender, and decides which vertical a studio signs up to.
 *
 * Plain data with no server imports, so client components can read it too.
 * The beauty brand has no name yet: everything that will change once it has
 * one comes from the environment, so naming it is a config change, not a
 * deploy of new code.
 */

export type BrandKey = "temppo" | "beauty";
export type BrandVertical = "CLASSES" | "APPOINTMENTS";

export type Brand = {
  key: BrandKey;
  name: string;
  shortName: string;
  /** Hostnames that serve this brand. The first is canonical. */
  domains: string[];
  vertical: BrandVertical;
  accent: string;
  themeColor: string;
  background: string;
  emailFrom: string;
  description: string;
};

function list(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

const beautyName = process.env.NEXT_PUBLIC_BEAUTY_BRAND_NAME || "Agenda Belleza";

export const BRANDS: Record<BrandKey, Brand> = {
  temppo: {
    key: "temppo",
    name: "TEMPPO Reservas",
    shortName: "TEMPPO",
    domains: list(process.env.NEXT_PUBLIC_TEMPPO_DOMAINS || "reservas.temppo.uy"),
    vertical: "CLASSES",
    accent: "#E07A5F",
    themeColor: "#c0563c",
    background: "#fbf8f5",
    emailFrom: process.env.EMAIL_FROM || "TEMPPO Reservas <no-reply@reservas.temppo.uy>",
    description:
      "Software de reservas y gestión para estudios. Cupos fijos, packs, lista de espera, " +
      "control de asistencia y registro de pagos.",
  },
  beauty: {
    key: "beauty",
    name: beautyName,
    shortName: process.env.NEXT_PUBLIC_BEAUTY_BRAND_SHORT || beautyName,
    domains: list(process.env.NEXT_PUBLIC_BEAUTY_DOMAINS),
    vertical: "APPOINTMENTS",
    accent: "#B5536F",
    themeColor: "#8f3d55",
    background: "#fbf7f8",
    emailFrom:
      process.env.BEAUTY_EMAIL_FROM || process.env.EMAIL_FROM || `${beautyName} <no-reply@reservas.temppo.uy>`,
    description:
      "Agenda online para profesionales de belleza: reservas 24 horas, señas con Mercado Pago, " +
      "recordatorios y ficha de cada clienta.",
  },
};

export const DEFAULT_BRAND: BrandKey = "temppo";

export function isBrandKey(value: unknown): value is BrandKey {
  return value === "temppo" || value === "beauty";
}

/** A stored studio.brand, tolerating rows written before brands existed. */
export function brandByKey(key: string | null | undefined): Brand {
  return BRANDS[isBrandKey(key) ? key : DEFAULT_BRAND];
}

/** Which brand a hostname belongs to. Unknown hosts get the default. */
export function brandForHost(host: string | null | undefined): Brand {
  const hostname = (host ?? "").toLowerCase().split(":")[0];
  for (const brand of Object.values(BRANDS)) {
    if (brand.domains.some((d) => hostname === d || hostname.endsWith("." + d))) return brand;
  }
  return BRANDS[DEFAULT_BRAND];
}
