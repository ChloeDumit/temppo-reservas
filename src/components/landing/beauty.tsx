import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/app/icon";
import { BeautyWordmark } from "@/components/brand";
import { buttonClass } from "@/components/ui/button";
import { whatsappLink } from "@/lib/payment-code";
import type { Brand } from "@/lib/brand/registry";

/**
 * The beauty brand's front page. Same bones as TEMPPO's — recognition of her
 * week first, then what changes, then plain answers — but about a chair and a
 * client rather than a class and a seat. No prices until there are prices.
 */
export async function BeautyLanding({ brand }: { brand: Brand }) {
  const t = await getTranslations("marketingBeauty");

  const pain = [t("pain1"), t("pain2"), t("pain3"), t("pain4")];
  const steps = [
    { n: "1", title: t("step1Title"), body: t("step1Body") },
    { n: "2", title: t("step2Title"), body: t("step2Body") },
    { n: "3", title: t("step3Title"), body: t("step3Body") },
  ];
  const capabilities = [
    { icon: "wallet", title: t("cap1Title"), body: t("cap1Body") },
    { icon: "plus", title: t("cap2Title"), body: t("cap2Body") },
    { icon: "users", title: t("cap3Title"), body: t("cap3Body") },
    { icon: "repeat", title: t("cap4Title"), body: t("cap4Body") },
    { icon: "phone", title: t("cap5Title"), body: t("cap5Body") },
    { icon: "calendar", title: t("cap6Title"), body: t("cap6Body") },
  ];
  const faq = [
    { q: t("faq1Q"), a: t("faq1A") },
    { q: t("faq2Q"), a: t("faq2A") },
    { q: t("faq3Q"), a: t("faq3A") },
    { q: t("faq4Q"), a: t("faq4A") },
    { q: t("faq5Q"), a: t("faq5A") },
  ];

  const phone = process.env.BEAUTY_WHATSAPP || process.env.TEMPPO_WHATSAPP;
  const whatsapp = phone ? whatsappLink(phone, t("whatsappMessage")) : null;

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-5">
        <BeautyWordmark name={brand.name} className="text-2xl" />
        <nav className="flex w-full items-center gap-2 sm:w-auto">
          <Link href="/login" className={buttonClass("ghost", "sm", "flex-1 sm:flex-none")}>
            {t("login")}
          </Link>
          <Link href="/register" className={buttonClass("primary", "sm", "flex-1 sm:flex-none")}>
            {t("cta")}
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
          <p className="mb-4 text-sm font-medium uppercase tracking-widest text-accent">{t("eyebrow")}</p>
          <h1 className="max-w-3xl text-balance text-4xl leading-[1.1] sm:text-5xl">{t("tagline")}</h1>
          <p className="mt-5 max-w-xl text-lg text-ink-soft">{t("subtitle")}</p>
          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
            <Link href="/register" className={buttonClass("primary", "md")}>
              {t("cta")}
            </Link>
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "md")}>
                {t("whatsapp")}
              </a>
            )}
          </div>
          <p className="mt-4 text-sm text-muted">{t("trialNote")}</p>
        </section>

        <section className="border-y border-line bg-sunken">
          <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
            <h2 className="max-w-lg text-balance text-2xl sm:text-3xl">{t("painTitle")}</h2>
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

        <section className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
          <h2 className="max-w-2xl text-balance text-2xl sm:text-3xl">{t("stepsTitle")}</h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-3">
            {steps.map((step) => (
              <li key={step.n} className="rounded-[var(--radius-lg)] border border-line bg-surface p-5">
                <span className="flex size-9 items-center justify-center rounded-full bg-accent-soft font-display text-lg font-semibold text-accent-ink">
                  {step.n}
                </span>
                <p className="mt-3 font-medium text-ink">{step.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-y border-line bg-sunken">
          <div className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
            <h2 className="max-w-2xl text-balance text-2xl sm:text-3xl">{t("capsTitle")}</h2>
            <div className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {capabilities.map((cap) => (
                <div key={cap.title} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-accent shadow-[var(--shadow-soft)]">
                    <Icon name={cap.icon} className="size-[18px]" />
                  </span>
                  <div>
                    <p className="font-medium text-ink">{cap.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-soft">{cap.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-5 py-16 sm:py-24">
          <h2 className="text-balance text-2xl sm:text-3xl">{t("faqTitle")}</h2>
          <dl className="mt-8 divide-y divide-line border-y border-line">
            {faq.map((item) => (
              <div key={item.q} className="py-5">
                <dt className="font-medium text-ink">{item.q}</dt>
                <dd className="mt-2 text-[15px] leading-relaxed text-ink-soft">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mx-auto max-w-5xl px-5 pb-20 text-center">
          <h2 className="mx-auto max-w-xl text-balance text-2xl sm:text-3xl">{t("closeTitle")}</h2>
          <Link href="/register" className={buttonClass("primary", "md", "mt-6")}>
            {t("cta")}
          </Link>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-muted">
          <BeautyWordmark name={brand.name} subdued />
          <span>© {new Date().getFullYear()} TEMPPO SAS</span>
        </div>
      </footer>
    </div>
  );
}
