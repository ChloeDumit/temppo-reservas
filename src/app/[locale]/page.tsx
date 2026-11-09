import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/app/icon";
import { buttonClass } from "@/components/ui/button";
import { whatsappLink } from "@/lib/payment-code";
import { PAID_PLANS, PLATFORM_CURRENCY } from "@/lib/billing/plans";
import { planPrices } from "@/lib/billing";
import { formatMoney } from "@/lib/money";
import { getBrand } from "@/lib/brand/server";
import { BeautyLanding } from "@/components/landing/beauty";

/*
  Prices are read rather than written here, so changing one in the platform
  console changes the page too. Hourly is far more often than a price moves
  and keeps the most-visited page off the database on every hit.
*/
export const revalidate = 3600;

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // The same address serves two products; the domain decides which front door.
  const brand = await getBrand();
  if (brand.key === "beauty") return <BeautyLanding brand={brand} />;

  const t = await getTranslations("marketing");
  const tb = await getTranslations("billing");

  const pain = [t("pain1"), t("pain2"), t("pain3"), t("pain4")];

  const stats = [
    { value: t("stat1Value"), label: t("stat1Label") },
    { value: t("stat2Value"), label: t("stat2Label") },
    { value: t("stat3Value"), label: t("stat3Label") },
  ];

  const linkSteps = [
    { title: t("linkStep1Title"), body: t("linkStep1Body"), icon: "share" as const },
    { title: t("linkStep2Title"), body: t("linkStep2Body"), icon: "phone" as const },
    { title: t("linkStep3Title"), body: t("linkStep3Body"), icon: "check" as const },
  ];

  /*
    Three ways the same system is used, not three products. The rubro is
    chosen at sign-up and can be changed afterwards, so this section is a
    description of what it adapts to rather than a price list.
  */
  const kinds = [
    { icon: "repeat" as const, name: t("kind1Name"), who: t("kind1For"), body: t("kind1Body") },
    { icon: "court" as const, name: t("kind2Name"), who: t("kind2For"), body: t("kind2Body") },
    { icon: "clock" as const, name: t("kind3Name"), who: t("kind3For"), body: t("kind3Body") },
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
    { q: t("faq5Q"), a: t("faq5A") },
    { q: t("faq2Q"), a: t("faq2A") },
    { q: t("faq3Q"), a: t("faq3A") },
    { q: t("faq4Q"), a: t("faq4A") },
  ];

  const prices = await planPrices();

  /*
    Each plan says what it covers in the unit its rubro understands: a studio
    counts students, a club counts courts. One price list, three ways of
    reading the same line.
  */
  const tiers = PAID_PLANS.map((plan) => {
    const key = plan === "ESSENTIAL" ? "essential" : plan === "STUDIO" ? "studio" : "network";
    return {
      plan,
      name: tb(`plan.${plan}`),
      price: formatMoney(prices[plan], PLATFORM_CURRENCY, locale),
      featured: plan === "STUDIO",
      limits: [
        { label: t("limitClasses"), value: t(`${key}Classes`) },
        { label: t("limitVenues"), value: t(`${key}Venues`) },
        { label: t("limitAppointments"), value: t(`${key}Appointments`) },
        { label: t("limitLocations"), value: t(`${key}Locations`) },
      ],
    };
  });

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
      {/*
        On the dark band so the page opens as one surface. The subdued brand
        is what reads on it: the product word is set in muted, which carries
        on near-black where ink-soft would disappear.
      */}
      <header className="bg-ink text-paper">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-5">
          <Brand subdued />
          <nav className="flex w-full items-center gap-2 sm:w-auto">
            <Link
              href="/login"
              className="pressable touch-target inline-flex flex-1 items-center justify-center rounded-md px-3 text-sm font-medium text-paper/70 sm:flex-none"
            >
              {t("ctaSecondary")}
            </Link>
            <Link href="/register" className={buttonClass("primary", "sm", "flex-1 sm:flex-none")}>
              {t("ctaPrimary")}
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* ------------------------------------------------------------ hero */}
        {/*
          Dark, and marked out like a court. The product books courts, pitches
          and halls as readily as class times, and a cream page with a serif
          headline reads as a boutique rather than as somewhere a club would
          keep its Friday night.
        */}
        <section className="court-lines bg-ink text-paper">
          <div className="mx-auto max-w-5xl px-5 py-20 sm:py-28">
            <p className="mb-5 text-xs font-medium uppercase tracking-[0.2em] text-accent">
              {t("eyebrow")}
            </p>
            <h1 className="max-w-3xl text-balance font-display text-[2.6rem] font-semibold leading-[0.98] tracking-tight sm:text-6xl lg:text-7xl">
              {t("tagline")}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-paper/70">{t("subtitle")}</p>

            <div className="mt-9 flex flex-wrap items-center gap-x-4 gap-y-3">
              <Link href="/register" className={buttonClass("primary", "md")}>
                {t("ctaPrimary")}
              </Link>
              {whatsapp && (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pressable touch-target inline-flex items-center justify-center rounded-md border border-paper/25 px-4 text-sm font-medium text-paper"
                >
                  {t("whatsapp")}
                </a>
              )}
            </div>
            <p className="mt-4 text-sm text-paper/55">{t("trialNote")}</p>
          </div>

          {/*
            Three numbers, set big. What a club reads first on any page is a
            figure, and these are the three that answer "what does it cost me
            and what does it change".
          */}
          <div className="border-t border-paper/15">
            <dl className="mx-auto grid max-w-5xl grid-cols-3 divide-x divide-paper/15">
              {stats.map((stat) => (
                <div key={stat.label} className="px-5 py-7 text-center sm:py-9">
                  <dt className="sr-only">{stat.label}</dt>
                  <dd>
                    <span className="block font-display text-3xl tabular-nums text-accent sm:text-5xl">
                      {stat.value}
                    </span>
                    <span className="mt-1 block text-[11px] uppercase tracking-wider text-paper/55 sm:text-xs">
                      {stat.label}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ------------------------------------------------- the way it is now */}
        <section className="border-y border-line bg-sunken">
          <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
            <h2 className="max-w-lg text-balance font-display text-3xl font-semibold leading-[1.05] tracking-tight sm:text-4xl">{t("painTitle")}</h2>

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

        {/* ------------------------------------------------------- the rubros */}
        <section id="rubros" className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
          <h2 className="max-w-2xl text-balance font-display text-3xl font-semibold leading-[1.05] tracking-tight sm:text-4xl">{t("kindsTitle")}</h2>
          <p className="mt-4 max-w-2xl text-ink-soft">{t("kindsBody")}</p>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {kinds.map((kind) => (
              <article
                key={kind.name}
                className="rounded-[var(--radius-lg)] border border-line bg-surface p-6"
              >
                <Icon name={kind.icon} className="size-5 text-accent" />
                <h3 className="mt-3 font-display text-xl">{kind.name}</h3>
                <p className="mt-0.5 text-xs uppercase tracking-wider text-muted">{kind.who}</p>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{kind.body}</p>
              </article>
            ))}
          </div>

          <p className="mt-5 text-sm text-muted">{t("kindsNote")}</p>
        </section>

        {/* ------------------------------------------------ the public link */}
        <section id="link" className="court-lines border-y border-ink bg-ink text-paper">
          <div className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
            <h2 className="max-w-xl text-balance font-display text-3xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
              {t("linkTitle")}
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-paper/70">{t("linkBody")}</p>

            <ol className="mt-10 grid gap-4 sm:grid-cols-3">
              {linkSteps.map((step, i) => (
                <li
                  key={step.title}
                  className="seq-step flex gap-4 rounded-[var(--radius-lg)] border border-paper/15 bg-paper/5 p-5 sm:flex-col sm:gap-3"
                  style={{ animationDelay: `${i * 900}ms` }}
                >
                  <span
                    className={
                      i === 2
                        ? "flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-white"
                        : "flex size-9 shrink-0 items-center justify-center rounded-full bg-paper/10 text-paper/80"
                    }
                  >
                    <Icon name={step.icon} className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium text-paper">{step.title}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-paper/60">
                      {step.body}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ----------------------------------------------------- capabilities */}
        <section id="funciones" className="border-t border-line">
          <div className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
            <h2 className="max-w-lg text-balance font-display text-3xl font-semibold leading-[1.05] tracking-tight sm:text-4xl">{t("capsTitle")}</h2>

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

        {/* ---------------------------------------------------------- prices */}
        <section id="precios" className="border-t border-line bg-sunken">
          <div className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
            <h2 className="max-w-lg text-balance font-display text-3xl font-semibold leading-[1.05] tracking-tight sm:text-4xl">{t("pricesTitle")}</h2>
            <p className="mt-4 max-w-xl text-ink-soft">{t("pricesBody")}</p>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {tiers.map((tier) => (
                <article
                  key={tier.plan}
                  className={
                    tier.featured
                      ? "rounded-[var(--radius-lg)] border border-accent/40 bg-accent-soft p-6"
                      : "rounded-[var(--radius-lg)] border border-line bg-surface p-6"
                  }
                >
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <h3 className="font-display text-xl">{tier.name}</h3>
                    {tier.featured && (
                      <span className="rounded-[var(--radius-pill)] bg-accent px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-white">
                        {t("mostChosen")}
                      </span>
                    )}
                  </div>

                  <p className="mt-4 font-display text-3xl tabular-nums text-accent">
                    {tier.price}
                  </p>
                  <p className="text-xs uppercase tracking-widest text-muted">{t("perMonth")}</p>

                  <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
                    {tier.limits.map((limit) => (
                      <div key={limit.label} className="flex justify-between gap-3">
                        <dt className="text-muted">{limit.label}</dt>
                        <dd className="text-right text-ink">{limit.value}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </div>

            <p className="mt-5 text-sm text-muted">{t("priceEverything")}</p>
            <p className="mt-1 text-sm text-muted">{t("priceAnnual")}</p>

            <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
              <Link href="/register" className={buttonClass("primary", "md")}>
                {t("ctaPrimary")}
              </Link>
              <span className="text-sm text-muted">{t("trialNote")}</span>
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
            <h2 className="font-display text-3xl font-semibold leading-[1.05] tracking-tight sm:text-4xl">{t("faqTitle")}</h2>

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
        <section className="court-lines border-t border-ink bg-ink text-paper">
          <div className="mx-auto max-w-5xl px-5 py-20 text-center sm:py-24">
            <h2 className="mx-auto max-w-lg text-balance font-display text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
              {t("closingTitle")}
            </h2>
            <p className="mx-auto mt-4 max-w-md text-lg text-paper/70">{t("closingBody")}</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link href="/register" className={buttonClass("primary", "md")}>
                {t("ctaPrimary")}
              </Link>
              {whatsapp && (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pressable touch-target inline-flex items-center justify-center rounded-md border border-paper/25 px-4 text-sm font-medium text-paper"
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
