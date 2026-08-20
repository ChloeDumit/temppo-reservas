import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Brand } from "@/components/brand";
import { buttonClass } from "@/components/ui/button";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("marketing");
  const tn = await getTranslations("nav");

  const features = [
    { title: t("feature1Title"), body: t("feature1Body") },
    { title: t("feature2Title"), body: t("feature2Body") },
    { title: t("feature3Title"), body: t("feature3Body") },
  ];

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <Brand />
        <nav className="flex items-center gap-2">
          <Link href="/login" className={buttonClass("ghost", "sm")}>
            {t("ctaSecondary")}
          </Link>
          <Link href="/register" className={buttonClass("primary", "sm")}>
            {t("ctaPrimary")}
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-5">
        <section className="border-b border-line py-16 sm:py-24">
          <p className="mb-4 text-sm font-medium uppercase tracking-widest text-accent">
            {tn("book")} · {tn("students")} · {tn("payments")}
          </p>
          <h1 className="max-w-3xl text-4xl leading-[1.1] sm:text-5xl">{t("tagline")}</h1>
          <p className="mt-5 max-w-xl text-lg text-ink-soft">{t("subtitle")}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/register" className={buttonClass("primary", "md")}>
              {t("ctaPrimary")}
            </Link>
            <span className="text-sm text-muted">{t("trialNote")}</span>
          </div>
        </section>

        {/* The product doing its job, before any feature list. */}
        <section className="border-b border-line py-14 sm:py-20">
          <div className="grid items-center gap-10 sm:grid-cols-[1fr_auto]">
            <div>
              <h2 className="text-2xl sm:text-3xl">{t("videoTitle")}</h2>
              <p className="mt-3 max-w-md text-ink-soft">{t("subtitle")}</p>
            </div>

            <div className="mx-auto w-full max-w-[260px] sm:mx-0">
              <div className="overflow-hidden rounded-[2rem] border-8 border-ink bg-ink shadow-lift">
                <video
                  className="block h-auto w-full"
                  src="/temppo-reservas-demo-web.mp4"
                  poster="/temppo-reservas-poster.jpg"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  aria-label={t("videoAlt")}
                />
              </div>
            </div>
          </div>
        </section>
        <section className="grid gap-px overflow-hidden border-b border-line bg-line sm:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="bg-paper px-1 py-10 sm:px-6">
              <h2 className="text-lg">{feature.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{feature.body}</p>
            </div>
          ))}
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 py-10 text-sm text-muted">
          <Brand subdued />
          <span>© {new Date().getFullYear()} TEMPPO SAS</span>
        </footer>
      </main>
    </div>
  );
}
