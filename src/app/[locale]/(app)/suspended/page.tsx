import { getTranslations, setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { Mascot } from "@/components/brand";
import { LogoutButton } from "@/components/app/logout-button";

/** Shown while a studio is suspended. Deliberately calm and not alarming. */
export default async function SuspendedPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("errors");
  const user = await getCurrentUser();

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <Mascot size={64} />
      <h1 className="mt-5 text-2xl text-ink">{t("studioSuspended")}</h1>
      {user?.studio.suspendedReason && (
        <p className="mt-3 rounded-[var(--radius-lg)] bg-sunken px-4 py-3 text-sm text-ink-soft">
          {user.studio.suspendedReason}
        </p>
      )}
      <div className="mt-6">
        <LogoutButton />
      </div>
    </div>
  );
}
