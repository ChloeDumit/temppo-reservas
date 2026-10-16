import { getTranslations } from "next-intl/server";
import { getBrand } from "@/lib/brand/server";
import { BeautyWordmark, Brand } from "@/components/brand";

/** "Booking by …" under public pages, in whichever brand the page is served as. */
export async function BrandFooter() {
  const brand = await getBrand();
  const t = await getTranslations("trial");
  return (
    <footer className="flex items-center justify-center gap-2 pb-8 text-xs text-muted">
      {t("poweredBy")}{" "}
      {brand.key === "temppo" ? <Brand subdued className="text-xs" /> : <BeautyWordmark name={brand.name} subdued className="text-sm" />}
    </footer>
  );
}
