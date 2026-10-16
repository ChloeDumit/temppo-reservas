import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getBrand } from "@/lib/brand/server";
import { RegisterForm } from "./register-form";

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  const brand = await getBrand();

  return (
    <>
      <RegisterForm beauty={brand.vertical === "APPOINTMENTS"} />
      <p className="mt-5 text-center text-sm text-muted">
        {t("haveAccount")}{" "}
        <Link href="/login" className="text-accent underline underline-offset-4">
          {t("loginTitle")}
        </Link>
      </p>
    </>
  );
}
