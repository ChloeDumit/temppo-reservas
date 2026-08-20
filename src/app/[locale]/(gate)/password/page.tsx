import { getTranslations, setRequestLocale } from "next-intl/server";
import { assertUser } from "@/lib/auth/guards";
import { Card, CardBody } from "@/components/ui/card";
import { Mascot } from "@/components/brand";
import { PasswordForm } from "./password-form";

/**
 * Where an account with a temporary password lands.
 *
 * Outside the app shell on purpose: there is exactly one thing to do here, and
 * navigation would only invite wandering off with a shared password still live.
 */
export default async function PasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // assertUser, not requireUser: the guard redirects here, so using it would loop.
  const user = await assertUser();
  const t = await getTranslations("password");

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-5 flex items-center gap-3">
        <Mascot size={40} />
        <div>
          <h1 className="text-xl text-ink">{t("title")}</h1>
          <p className="text-sm text-muted">{t("subtitle", { name: user.name.split(" ")[0] })}</p>
        </div>
      </div>

      <Card>
        <CardBody>
          <PasswordForm />
        </CardBody>
      </Card>
    </div>
  );
}
