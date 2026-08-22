import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/app/icon";
import { buttonClass } from "@/components/ui/button";
import { whatsappLink } from "@/lib/payment-code";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("marketing");

  const pain = [t("pain1"), t("pain2"), t("pain3"), t("pain4")];

  const waitlist = [
    { title: t("waitStep1Title"), body: t("waitStep1Body"), icon: "x" as const },
    { title: t("waitStep2Title"), body: t("waitStep2Body"), icon: "alert" as const },
    { title: t("waitStep3Title"), body: t("waitStep3Body"), icon: "check" as const },
  ];

  const capabilities = [
    { icon: "repeat" as const, title: t("cap1Title"), body: t("cap1Body") },
    { icon: "wallet" as const, title: t("cap2Title"), body: t("cap2Body") },
    { icon: "chart" as const, title: t("cap3Title"), body: t("cap3Body") },
    { icon: "scan" as const, title: t("cap4Title"), body: t("cap4Body") },
    { icon: "clock" as const, title: t("cap5Title"), body: t("cap5Body") },
    { icon: "users" as const, title: t("cap6Title"), body: t("cap6Body") },
    { icon: "spark" as const, title: t("cap7Title"), body: t("cap7Body") },
    { icon: "phone" as const, title: t("cap8Title"), body: t("cap8Body") },
  ];

  const faq = [
    { q: t("faq1Q"), a: t("faq1A") },
    { q: t("faq2Q"), a: t("faq2A") },
    { q: t("faq3Q"), a: t("faq3A") },
    { q: t("faq4Q"), a: t("faq4A") },
  ];

  const phone = process.env.TEMPPO_WHATSAPP;
  const whatsapp = phone ? whatsappLink(phone, t("whatsappMessage")) : null;

  return (
    <div className="min-h-dvh">
      {/*
        The brand and both calls to action do not fit one phone-width row —
        together they ran 418px wide at 375px and pushed the whole page into a
        sideways scroll. So the nav drops to its own full-width row below the
        brand and the two buttons split it, which also gives them a proper
        thumb-sized target. One row again from `sm` up, where there is room.

        Wrapping rather than hiding: "iniciar sesión" is what a returning studio
        comes here for, and the Spanish labels are the long ones — a fixed
        layout that fits today breaks on the next copy change.
      */}
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-5">
        <Brand />
        <nav className="flex w-full items-center gap-2 sm:w-auto">
          <Link href="/login" className={buttonClass("ghost", "sm", "flex-1 sm:flex-none")}>
            {t("ctaSecondary")}
          </Link>
          <Link href="/register" className={buttonClass("primary", "sm", "flex-1 sm:flex-none")}>
            {t("ctaPrimary")}
          </Link>
        </nav>
      </header>

      <main>
        {/* ------------------------------------------------------------ hero */}
        <section className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
          <p className="mb-4 text-sm font-medium uppercase tracking-widest text-accent">
            {t("eyebrow")}
          </p>
          <h1 className="max-w-3xl text-balance text-4xl leading-[1.1] sm:text-5xl">
            {t("tagline")}
          </h1>
          <p className="mt-5 max-w-xl text-lg text-ink-soft">{t("subtitle")}</p>
          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
            <Link href="/register" className={buttonClass("primary", "md")}>
              {t("ctaPrimary")}
            </Link>
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass("secondary", "md")}
              >
                {t("whatsapp")}
              </a>
            )}
          </div>
          <p className="mt-4 text-sm text-muted">{t("trialNote")}</p>
        </section>

        {/* ------------------------------------------------- the way it is now */}
        <section className="border-y border-line bg-sunken">
          <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
            <h2 className="max-w-lg text-balance text-2xl sm:text-3xl">{t("painTitle")}</h2>

            {/*
              Recognition before features. A studio owner has to see her own
              week described before she will believe anything that follows, so
              this is set as prose rather than as a tidy grid of benefits.
            */}
            <ul className="mt-7 max-w-2xl space-y-3.5">
              {pain.map((line) => (
                <li key={line} className="flex gap-3 text-[17px] leading-relaxed text-ink-soft">
                  <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-line-strong" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>

            <p className="mt-8 max-w-md font-display text-xl text-ink">{t("painClose")}</p>
          </div>
        </section>

        {/* --------------------------------------------------- the two models */}
        <section id="modelos" className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
          <h2 className="max-w-2xl text-balance text-2xl sm:text-3xl">{t("modelsTitle")}</h2>
          <p className="mt-4 max-w-2xl text-ink-soft">{t("modelsBody")}</p>

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {/*
              The fixed spot leads and carries the accent: it is the half of this
              that no competitor models, and the reason the page exists.
            */}
            <article className="rounded-[var(--radius-lg)] border border-accent/30 bg-accent-soft p-6 sm:p-7">
              <p className="text-xs font-medium uppercase tracking-widest text-accent">
                {t("modelFixedTag")}
              </p>
              <h3 className="mt-3 font-display text-2xl">{t("modelFixedTitle")}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-ink">{t("modelFixedBody")}</p>
              <p className="mt-4 border-t border-accent/20 pt-4 text-[15px] leading-relaxed text-ink-soft">
                {t("modelFixedRule")}
              </p>
            </article>

            <article className="rounded-[var(--radius-lg)] border border-line bg-surface p-6 sm:p-7">
              <p className="text-xs font-medium uppercase tracking-widest text-muted">
                {t("modelPackTag")}
              </p>
              <h3 className="mt-3 font-display text-2xl">{t("modelPackTitle")}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-ink">{t("modelPackBody")}</p>
              <p className="mt-4 border-t border-line pt-4 text-[15px] leading-relaxed text-ink-soft">
                {t("modelPackRule")}
              </p>
            </article>
          </div>
        </section>

        {/* ------------------------------------------------ the waitlist, shown */}
        <section id="lista-de-espera" className="border-y border-line bg-sunken">
          <div className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
            <h2 className="max-w-xl text-balance text-2xl sm:text-3xl">{t("waitTitle")}</h2>
            <p className="mt-4 max-w-xl text-ink-soft">{t("waitBody")}</p>

            {/*
              Three steps that arrive in order, then hold. The sequence is the
              argument — a still list of the same three sentences reads as a
              feature, watching the seat refill reads as money recovered.
              Motion is decoration here, so it goes away entirely when the
              visitor has asked for less of it (see globals.css).
            */}
            <ol className="mt-10 grid gap-4 sm:grid-cols-3">
              {waitlist.map((step, i) => (
                <li
                  key={step.title}
                  className="seq-step flex gap-4 rounded-[var(--radius-lg)] border border-line bg-surface p-5 sm:flex-col sm:gap-3"
                  style={{ animationDelay: `${i * 900}ms` }}
                >
                  <span
                    className={
                      i === 2
                        ? "flex size-9 shrink-0 items-center justify-center rounded-full bg-positive-soft text-positive"
                        : "flex size-9 shrink-0 items-center justify-center rounded-full bg-sunken text-ink-soft"
                    }
                  >
                    <Icon name={step.icon} className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{step.title}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-ink-soft">
                      {step.body}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ------------------------------------------------------------ video */}
        <section className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
          <div className="grid items-center gap-10 sm:grid-cols-[1fr_auto]">
            <div>
              <h2 className="text-2xl sm:text-3xl">{t("videoTitle")}</h2>
              <p className="mt-3 max-w-md text-ink-soft">{t("subtitle")}</p>
              <div className="mt-6">
                <Link href="/register" className={buttonClass("secondary", "md")}>
                  {t("ctaPrimary")}
                </Link>
              </div>
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

        {/* ----------------------------------------------------- capabilities */}
        <section id="funciones" className="border-t border-line">
          <div className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
            <h2 className="max-w-lg text-balance text-2xl sm:text-3xl">{t("capsTitle")}</h2>

            <div className="mt-10 grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
              {capabilities.map((cap) => (
                <div key={cap.title}>
                  <Icon name={cap.icon} className="size-5 text-accent" />
                  <h3 className="mt-3 text-[15px] font-semibold text-ink">{cap.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{cap.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------- migration */}
        <section className="mx-auto max-w-5xl px-5 py-16 sm:py-20">
          <div className="rounded-[var(--radius-xl)] border border-line bg-surface p-7 shadow-soft sm:p-10">
            <div className="grid items-center gap-6 sm:grid-cols-[1fr_auto]">
              <div>
                <h2 className="text-balance text-2xl sm:text-3xl">{t("migrationTitle")}</h2>
                <p className="mt-3 max-w-xl text-ink-soft">{t("migrationBody")}</p>
              </div>
              {whatsapp && (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass("primary", "md", "w-full sm:w-auto")}
                >
                  {t("whatsapp")}
                </a>
              )}
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------------- faq */}
        <section id="preguntas" className="border-t border-line">
          <div className="mx-auto max-w-3xl px-5 py-16 sm:py-24">
            <h2 className="text-2xl sm:text-3xl">{t("faqTitle")}</h2>

            {/*
              Native disclosure elements: they open without JavaScript, they are
              findable with the browser's own page search, and they need no
              state on a page that is otherwise entirely static.
            */}
            <div className="mt-8 divide-y divide-line border-y border-line">
              {faq.map((item) => (
                <details key={item.q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium text-ink marker:content-none">
                    {item.q}
                    <Icon
                      name="chevronDown"
                      className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180"
                    />
                  </summary>
                  <p className="mt-2.5 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- closing */}
        <section className="border-t border-line bg-blush">
          <div className="mx-auto max-w-5xl px-5 py-16 text-center sm:py-20">
            <h2 className="mx-auto max-w-lg text-balance text-2xl sm:text-3xl">
              {t("closingTitle")}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-ink-soft">{t("closingBody")}</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link href="/register" className={buttonClass("primary", "md")}>
                {t("ctaPrimary")}
              </Link>
              {whatsapp && (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass("secondary", "md")}
                >
                  {t("whatsapp")}
                </a>
              )}
            </div>
          </div>
        </section>

        <footer className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-10 text-sm text-muted">
          <Brand subdued />
          <span>© {new Date().getFullYear()} TEMPPO SAS</span>
        </footer>
      </main>
    </div>
  );
}
