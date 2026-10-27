import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { brandByKey, brandOverrideAllowed, getBrand } from "@/lib/brand/server";
import { appUrlFor } from "@/lib/brand/url";
import { accentVars } from "@/lib/color";
import { BeautyMascot, BeautyWordmark, Brand, BrandMark } from "@/components/brand";
import { SidebarNav, MobileTabBar } from "@/components/app/sidebar-nav";
import { LocaleSwitch } from "@/components/app/locale-switch";
import { LogoutButton } from "@/components/app/logout-button";
import { navFor, splitNav } from "@/components/app/nav-items";
import { InstallPrompt } from "@/components/app/install-prompt";
import { InboxBell, InboxProvider } from "@/components/app/inbox-bell";
import { GuidedTour } from "@/components/app/guided-tour";
import { isMercadoPagoOAuthConfigured } from "@/lib/payments/mercadopago-oauth";
import { LocationSwitcher } from "@/components/app/location-switcher";
import { locationsFor, currentLocationId } from "@/lib/locations";

export default async function AppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireUser();
  const studio = user.studio;
  const ts = await getTranslations("settings");

  const tc = await getTranslations("common");

  // Staff see every sucursal; a student only the ones they train at.
  const [locations, activeLocationId] = await Promise.all([
    locationsFor(studio.id, user.studentProfile?.id),
    currentLocationId(studio.id),
  ]);

  const locationSwitcher = (className?: string) => (
    <LocationSwitcher
      locations={locations}
      selected={activeLocationId}
      allLabel={tc("allLocations")}
      label={tc("location")}
      className={className}
    />
  );

  const { primary, overflow } = splitNav(user.role, studio.vertical);
  const beauty = studio.vertical === "APPOINTMENTS";
  const isStaff = user.role !== "STUDENT";
  const pushKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const home = user.role === "STUDENT" ? (beauty ? "/appointments" : "/my") : "/dashboard";

  // A studio lives on its own brand's domain. Signed in on the other one — an
  // old bookmark, a shared device — send them home rather than dress one
  // product in the other's colours.
  const brand = await getBrand();
  if (brand.key !== brandByKey(studio.brand).key && !brandOverrideAllowed()) {
    redirect(`${appUrlFor(studio)}/${locale}${home}`);
  }

  const StudioAvatar = () =>
    studio.logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={studio.logoUrl} alt="" className="size-8 rounded-lg object-contain" />
    ) : beauty ? (
      <BeautyMascot size={32} className="shrink-0 rounded-lg" />
    ) : (
      <BrandMark className="rounded-lg" />
    );

  return (
    // Studio branding is applied here, on every plan.
    <InboxProvider pushKey={pushKey} enabled={isStaff}>
    <div className="accent-scope min-h-dvh" style={accentVars(studio.accentColor)}>
      {/*
        Phone header: compact and identity-only. Navigation lives at the
        bottom where the thumb is, so nothing important sits up here.
      */}
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 pt-safe backdrop-blur-md md:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <Link href={home} className="pressable flex min-w-0 items-center gap-2.5">
            <StudioAvatar />
            <span className="truncate text-[15px] font-semibold text-ink">{studio.name}</span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            {locationSwitcher("max-w-[9rem] truncate")}
            {isStaff && <InboxBell />}
            <LocaleSwitch />
          </div>
        </div>
      </header>

      <div className="md:flex">
        {/*
          Tablets get a rail: icons with their names underneath, so the agenda
          keeps its width in portrait. From desktop width it opens into the
          full sidebar. Phones keep the bottom tab bar.
        */}
        <aside className="sticky top-0 hidden h-dvh w-[5.5rem] shrink-0 flex-col overflow-y-auto border-r border-line bg-surface px-2 py-5 md:flex lg:w-60 lg:px-3">
          <div className="mb-6 flex flex-col items-center gap-2 lg:flex-row lg:gap-1">
            <Link href={home} className="flex min-w-0 flex-1 items-center justify-center gap-2.5 px-2 lg:justify-start" title={studio.name}>
              <StudioAvatar />
              <span className="hidden truncate text-sm font-semibold lg:inline">{studio.name}</span>
            </Link>
            {isStaff && <InboxBell className="shrink-0" />}
          </div>

          <div className="mb-4 hidden px-1 lg:block">{locationSwitcher("w-full")}</div>

          <SidebarNav items={navFor(user.role, studio.vertical)} />

          <div className="mt-auto space-y-3 pt-4">
            <div className="hidden px-3 lg:block">
              <p className="truncate text-sm font-medium text-ink">{user.name}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
            </div>
            <LogoutButton />
            <div className="flex justify-center pt-1 lg:block lg:px-3">
              <LocaleSwitch />
            </div>
            <div className="hidden px-3 pt-2 lg:block">
              {beauty ? <BeautyWordmark name={brandByKey(studio.brand).name} subdued className="text-sm" /> : <Brand subdued className="text-xs" />}
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 pb-tabbar pt-5 sm:px-6 md:pb-10 md:pt-6 lg:px-8 lg:pt-8">
          {/* Dismissible, and hides itself once the app is installed. */}
          <InstallPrompt />
          {children}
        </main>
      </div>

      {/* Runs once on first sign-in; replayable from the account sheet. An
          appointment business gets its own steps: services and hours, not classes. */}
      <GuidedTour
        role={user.role}
        alreadySeen={Boolean(user.tourSeenAt)}
        beauty={beauty}
        mercadoPago={beauty && isMercadoPagoOAuthConfigured()}
      />

      <MobileTabBar
        primary={primary}
        overflow={overflow}
        user={{
          name: user.name,
          email: user.email,
          roleLabel: ts(`role${user.role}`),
        }}
      />
    </div>
    </InboxProvider>
  );
}
