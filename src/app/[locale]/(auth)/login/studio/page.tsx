import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { resolveStudioChoice } from "@/lib/auth/studio-choice";
import { localePath } from "@/i18n/routing";
import { SubmitButton } from "@/components/ui/submit-button";
import { chooseStudioAction } from "../../actions";

/**
 * Shown when one email holds an account at more than one studio. Reached only
 * with a token proving the login already succeeded — never linkable directly.
 */
export default async function ChooseStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string; next?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { token, next } = await searchParams;
  const t = await getTranslations("auth");
  const tc = await getTranslations("common");

  const resolved = token ? await resolveStudioChoice(token) : null;
  if (!resolved) redirect(localePath(locale, "/login?error=magic"));

  return (
    <div className="card px-5 py-6">
      <h1 className="text-xl">{t("chooseStudioTitle")}</h1>
      <p className="mt-1 text-sm text-muted">{t("chooseStudioSubtitle")}</p>

      <div className="mt-5 space-y-3">
        {resolved.users.map((user) => (
          <form key={user.id} action={chooseStudioAction}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="userId" value={user.id} />
            {next && <input type="hidden" name="next" value={next} />}
            <SubmitButton className="w-full" variant="ghost" pendingLabel={tc("loading")}>
              {user.studio.name}
            </SubmitButton>
          </form>
        ))}
      </div>
    </div>
  );
}
