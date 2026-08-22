import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Fraunces, Karla, Fredoka } from "next/font/google";
import { routing } from "@/i18n/routing";
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

const description =
  "Software de reservas y gestión para estudios. Cupos fijos, packs, lista de espera, " +
  "control de asistencia y registro de pagos.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "TEMPPO Reservas — cupos fijos, packs y lista de espera",
    template: "%s · TEMPPO Reservas",
  },
  description,
  keywords: [
    "software de gestión para estudios",
    "sistema de reservas de clases",
    "agenda de clases",
    "cupos fijos",
    "lista de espera",
    "Uruguay",
  ],
  openGraph: {
    type: "website",
    siteName: "TEMPPO Reservas",
    title: "TEMPPO Reservas — cupos fijos, packs y lista de espera",
    description,
    images: [{ url: "/temppo-reservas-poster.jpg", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TEMPPO Reservas",
    description,
    images: ["/temppo-reservas-poster.jpg"],
  },
  applicationName: "TEMPPO Reservas",
  // Lets iOS run the installed app standalone, like a native one.
  appleWebApp: {
    capable: true,
    title: "TEMPPO",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#c0563c",
  width: "device-width",
  initialScale: 1,
  // Studio owners zoom into the schedule on a phone — don't block it.
  maximumScale: 5,
  // Lets the layout paint under the notch and home indicator so the
  // safe-area insets actually mean something.
  viewportFit: "cover",
};

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

  return (
    <html lang={locale} className={`${display.variable} ${body.variable} ${brand.variable}`}>
      <body className="accent-scope min-h-dvh">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
