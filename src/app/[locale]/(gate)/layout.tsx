import type { ReactNode } from "react";
import { setRequestLocale } from "next-intl/server";

/**
 * Screens that stand between signing in and using the app — setting a
 * temporary password, or a suspended studio.
 *
 * Deliberately outside the (app) group: that layout calls requireUser(), which
 * is the very guard redirecting people here, so rendering inside it would
 * bounce forever.
 */
export default async function GateLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <div className="min-h-dvh bg-paper">{children}</div>;
}
