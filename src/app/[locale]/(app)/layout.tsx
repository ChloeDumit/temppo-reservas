import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/guards";
import { accentVars } from "@/lib/color";
import { Brand, BrandMark } from "@/components/brand";
import { SidebarNav, MobileTabBar } from "@/components/app/sidebar-nav";
import { LocaleSwitch } from "@/components/app/locale-switch";
import { LogoutButton } from "@/components/app/logout-button";
import { navFor, splitNav } from "@/components/app/nav-items";
import { InstallPrompt } from "@/components/app/install-prompt";
import { GuidedTour } from "@/components/app/guided-tour";
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

  const { primary, overflow } = splitNav(user.role);
  const home = user.role === "STUDENT" ? "/my" : "/dashboard";

  const StudioAvatar = () =>
    studio.logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={studio.logoUrl} alt="" className="size-8 rounded-lg object-contain" />
    ) : (
      <BrandMark className="rounded-lg" />
    );

  return (
    // Studio branding is applied here, on every plan.
    <div className="accent-scope min-h-dvh" style={accentVars(studio.accentColor)}>
      {/*
        Phone header: compact and identity-only. Navigation lives at the
        bottom where the thumb is, so nothing important sits up here.
      */}
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 pt-safe backdrop-blur-md lg:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <Link href={home} className="pressable flex min-w-0 items-center gap-2.5">
            <StudioAvatar />
            <span className="truncate text-[15px] font-semibold text-ink">{studio.name}</span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            {locationSwitcher("max-w-[9rem] truncate")}
            <LocaleSwitch />
          </div>
        </div>
      </header>

      <div className="lg:flex">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-5 lg:flex">
          <Link href={home} className="mb-6 flex items-center gap-2.5 px-2">
            <StudioAvatar />
            <span className="truncate text-sm font-semibold">{studio.name}</span>
          </Link>

          <div className="mb-4 px-1">{locationSwitcher("w-full")}</div>

          <SidebarNav items={navFor(user.role)} />

          <div className="mt-auto space-y-3 pt-4">
            <div className="px-3">
              <p className="truncate text-sm font-medium text-ink">{user.name}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
            </div>
            <LogoutButton />
            <div className="px-3 pt-1">
              <LocaleSwitch />
            </div>
            <div className="px-3 pt-2">
              <Brand subdued className="text-xs" />
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 pb-tabbar pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
          {/* Dismissible, and hides itself once the app is installed. */}
          <InstallPrompt />
          {children}
        </main>
      </div>

      {/* Runs once on first sign-in; replayable from the account sheet. */}
      <GuidedTour role={user.role} alreadySeen={Boolean(user.tourSeenAt)} />

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
  );
}
