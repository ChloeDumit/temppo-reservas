import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Fraunces, Karla } from "next/font/google";
import { routing } from "@/i18n/routing";
import "../globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700"],
  display: "swap",
});

const body = Karla({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "TEMPPO Reservas",
    template: "%s · TEMPPO Reservas",
  },
  description:
    "Gestión de reservas, alumnos y pagos para estudios de pilates, yoga y fitness.",
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
    <html lang={locale} className={`${display.variable} ${body.variable}`}>
      <body className="accent-scope min-h-dvh">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
