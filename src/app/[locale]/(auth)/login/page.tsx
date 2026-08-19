import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { next, error } = await searchParams;
  const t = await getTranslations("auth");

  return (
    <>
      <LoginForm next={next} linkExpired={error === "magic"} />
      <p className="mt-5 text-center text-sm text-muted">
        {t("noAccount")}{" "}
        <Link href="/register" className="text-accent underline underline-offset-4">
          {t("registerStudio")}
        </Link>
      </p>
    </>
  );
}
