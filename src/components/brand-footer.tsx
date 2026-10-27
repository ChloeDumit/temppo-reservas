import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getBrand } from "@/lib/brand/server";
import { BeautyWordmark, Brand } from "@/components/brand";

/** "Booking by …" under public pages, in whichever brand the page is served as. */
export async function BrandFooter() {
  const brand = await getBrand();
  const t = await getTranslations("trial");
  const tc = await getTranslations("common");
  return (
    <footer className="flex flex-wrap items-center justify-center gap-2 pb-8 text-xs text-muted">
      {t("poweredBy")}{" "}
      {brand.key === "temppo" ? <Brand subdued className="text-xs" /> : <BeautyWordmark name={brand.name} subdued className="text-sm" />}
      <span aria-hidden>·</span>
      <Link href="/privacy" className="underline-offset-4 hover:underline">
        {tc("privacy")}
      </Link>
    </footer>
  );
}

/** The product's own mark, in whichever brand the request is served as. */
export async function ProductBrand({ subdued, className }: { subdued?: boolean; className?: string }) {
  const brand = await getBrand();
  return brand.key === "temppo" ? (
    <Brand subdued={subdued} className={className} />
  ) : (
    <BeautyWordmark name={brand.name} subdued={subdued} className={className ?? "text-xl"} />
  );
}
