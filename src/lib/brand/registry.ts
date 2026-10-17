/**
 * The products sold from this codebase. Each brand is its own domain, name,
 * palette and sender, and decides which vertical a studio signs up to.
 *
 * Plain data with no server imports, so client components can read it too.
 * Both run on the same deployment: TEMPPO Reservas at reservas.temppo.uy for
 * class studios, Temppo Beauty at beauty.temppo.uy for appointments. The
 * environment can override names and domains (previews, a future own domain)
 * without a code change.
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
  /** Where this brand's icon set lives under public/. */
  iconBase: string;
};

function list(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

const beautyName = process.env.NEXT_PUBLIC_BEAUTY_BRAND_NAME || "Temppo Beauty";

/**
 * The beauty brand's sender: its own name over whatever address is already
 * verified for sending, so it never signs as "TEMPPO Reservas" just because
 * only EMAIL_FROM was configured.
 */
function beautySender() {
  if (process.env.BEAUTY_EMAIL_FROM) return process.env.BEAUTY_EMAIL_FROM;
  const address = /<([^>]+)>/.exec(process.env.EMAIL_FROM ?? "")?.[1] ?? process.env.EMAIL_FROM;
  return `${beautyName} <${address || "no-reply@reservas.temppo.uy"}>`;
}

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
    iconBase: "",
  },
  beauty: {
    key: "beauty",
    name: beautyName,
    shortName: process.env.NEXT_PUBLIC_BEAUTY_BRAND_SHORT || beautyName,
    domains: list(process.env.NEXT_PUBLIC_BEAUTY_DOMAINS || "beauty.temppo.uy"),
    vertical: "APPOINTMENTS",
    accent: "#B5536F",
    themeColor: "#8f3d55",
    background: "#fbf7f8",
    emailFrom: beautySender(),
    description:
      "Agenda online para profesionales de belleza: reservas 24 horas, señas con Mercado Pago, " +
      "recordatorios y ficha de cada clienta.",
    iconBase: "/beauty",
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
