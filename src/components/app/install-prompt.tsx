"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

/** Chrome's install event. Not in lib.dom, so it is declared here. */
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "temppo:install-dismissed";

/** Once installed, the app runs outside the browser's normal display mode. */
function isInstalled() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS predates the display-mode media query for home-screen apps.
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac; touch points give it away.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/**
 * Nudges people to install the PWA, since there is no store listing to send
 * them to.
 *
 * Two different jobs behind one button: Android and desktop Chrome hand us a
 * real install event we can trigger, while iOS exposes no API at all and can
 * only be walked through Share → Add to Home Screen.
 */
export function InstallPrompt() {
  const t = useTranslations("install");
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isInstalled()) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    // iOS never fires the event, so decide from the platform instead.
    if (isIos()) {
      setVisible(true);
      return;
    }

    const onPrompt = (event: Event) => {
      // Keep the event so the install can happen on a real user gesture.
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setVisible(false));

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setVisible(false);
  };

  const install = async () => {
    if (!installEvent) {
      setShowIosHelp(true);
      return;
    }
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") setVisible(false);
    setInstallEvent(null);
  };

  return (
    <>
      <aside
        className={cn(
          "mb-4 flex items-start gap-3 rounded-lg border border-accent/20 bg-accent-soft px-4 py-3.5",
          // Desktop Chrome can install too, but the pitch is about phones.
          "lg:hidden",
        )}
      >
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
          <Icon name="download" className="size-[18px]" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-accent-ink">{t("title")}</p>
          <p className="mt-0.5 text-xs text-accent-ink/80">{t("body")}</p>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={install}>
              <Icon name={installEvent ? "download" : "share"} className="size-4" />
              {installEvent ? t("install") : t("how")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={dismiss}>
              {t("later")}
            </Button>
          </div>
        </div>
      </aside>

      {/* iOS has no install API — the only path is showing people the steps. */}
      <Sheet open={showIosHelp} onClose={() => setShowIosHelp(false)} title={t("iosTitle")}>
        <ol className="space-y-4">
          {[
            { icon: "share", text: t("iosStep1") },
            { icon: "plus", text: t("iosStep2") },
            { icon: "check", text: t("iosStep3") },
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sunken text-sm font-semibold tabular-nums text-ink-soft">
                {i + 1}
              </span>
              <span className="flex-1 pt-1 text-sm text-ink">{step.text}</span>
              <Icon name={step.icon} className="mt-1.5 size-[18px] shrink-0 text-muted" />
            </li>
          ))}
        </ol>

        <p className="mt-5 rounded-md bg-sunken px-3 py-2.5 text-xs text-muted">
          {t("iosNote")}
        </p>
      </Sheet>
    </>
  );
}
