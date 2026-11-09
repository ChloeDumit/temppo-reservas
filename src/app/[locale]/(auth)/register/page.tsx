import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getBrand } from "@/lib/brand/server";
import { RegisterForm } from "./register-form";

/** "?tipo=canchas" on the link from the courts landing. */
const FROM_LANDING: Record<string, "CLASSES" | "VENUES" | "APPOINTMENTS"> = {
  canchas: "VENUES",
  clases: "CLASSES",
  turnos: "APPOINTMENTS",
};

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  const brand = await getBrand();
  const { tipo } = await searchParams;

  return (
    <>
      <RegisterForm
        beauty={brand.vertical === "APPOINTMENTS"}
        defaultKind={FROM_LANDING[tipo ?? ""] ?? "CLASSES"}
      />
      <p className="mt-5 text-center text-sm text-muted">
        {t("haveAccount")}{" "}
        <Link href="/login" className="text-accent underline underline-offset-4">
          {t("loginTitle")}
        </Link>
      </p>
    </>
  );
}
