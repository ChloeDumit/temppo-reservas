import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Fraunces, Karla, Fredoka } from "next/font/google";
import { routing } from "@/i18n/routing";
import { getBrand } from "@/lib/brand/server";
import "../globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700"],
  display: "swap",
});

/* The wordmark keeps temppo.uy's own typeface; the interface does not. */
const brand = Fredoka({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-brand-face",
  display: "swap",
});

const body = Karla({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

/*
  Absolute URLs for Open Graph. Without a base, a shared link renders with no
  image at all — and this gets shared into WhatsApp groups of studio owners,
  which is a channel worth more than any ad.
*/
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://reservas.temppo.uy";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  const temppo = brand.key === "temppo";
  const headline = temppo
    ? "TEMPPO Reservas — cupos fijos, packs y lista de espera"
    : `${brand.name} — tu agenda online con señas y recordatorios`;
  const poster = temppo ? "/temppo-reservas-poster.jpg" : undefined;

  return {
    metadataBase: new URL(temppo || !brand.domains[0] ? siteUrl : `https://${brand.domains[0]}`),
    title: { default: headline, template: `%s · ${brand.name}` },
    description: brand.description,
    keywords: temppo
      ? [
          "software de gestión para estudios",
          "sistema de reservas de clases",
          "agenda de clases",
          "cupos fijos",
          "lista de espera",
          "Uruguay",
        ]
      : ["agenda online", "reservas de turnos", "manicura", "estética", "pestañas", "señas", "Uruguay"],
    openGraph: {
      type: "website",
      siteName: brand.name,
      title: headline,
      description: brand.description,
      images: poster ? [{ url: poster, width: 1200, height: 630 }] : undefined,
    },
    twitter: {
      card: poster ? "summary_large_image" : "summary",
      title: brand.name,
      description: brand.description,
      images: poster ? [poster] : undefined,
    },
    applicationName: brand.name,
    // Lets iOS run the installed app standalone, like a native one.
    appleWebApp: {
      capable: true,
      title: brand.shortName,
      statusBarStyle: "default",
    },
    formatDetection: { telephone: false },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const brand = await getBrand();
  return {
    themeColor: brand.themeColor,
    width: "device-width",
    initialScale: 1,
    // Studio owners zoom into the schedule on a phone — don't block it.
    maximumScale: 5,
    // Lets the layout paint under the notch and home indicator so the
    // safe-area insets actually mean something.
    viewportFit: "cover",
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const activeBrand = await getBrand();

  return (
    <html lang={locale} data-brand={activeBrand.key} className={`${display.variable} ${body.variable} ${brand.variable}`}>
      <body className="accent-scope min-h-dvh">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
