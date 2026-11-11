"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { META_PIXEL_ID, SIGNUP_COOKIE, SOURCE_COOKIE } from "@/lib/signup-source";

/*
  The Meta pixel, to learn whether our ads bring businesses. Kept to our own
  marketing pages — the home page and sign-up — and to the moment right after
  a sign-up; never on a business's booking page or inside the app, where the
  people browsing are its clients (see the privacy policy).

  It also remembers, first touch, which ad brought the visitor (utm_*), so the
  sign-up can record it and the console can say «llegó por Meta».
*/


const MARKETING = /^\/(?:(?:es|en)\/?)?$|^\/(?:(?:es|en)\/)?register\/?$/;

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };

function loadPixel() {
  const w = window as unknown as { fbq?: Fbq; _fbq?: Fbq };
  if (w.fbq) return w.fbq;
  const fbq: Fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue!.push(args);
  } as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  w.fbq = fbq;
  w._fbq = fbq;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
  fbq("init", META_PIXEL_ID);
  return fbq;
}

function readCookie(name: string) {
  return document.cookie.split("; ").find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}

export function MetaPixel() {
  const pathname = usePathname();

  useEffect(() => {
    const marketing = MARKETING.test(pathname);

    // First touch: the ad that brought her, kept for a month.
    if (marketing) {
      const q = new URLSearchParams(window.location.search);
      const source = q.get("utm_source") ?? (q.get("fbclid") ? "meta" : null);
      if (source && !readCookie(SOURCE_COOKIE)) {
        const value = encodeURIComponent(
          JSON.stringify({ source, medium: q.get("utm_medium"), campaign: q.get("utm_campaign"), at: new Date().toISOString().slice(0, 10) }),
        );
        document.cookie = `${SOURCE_COOKIE}=${value}; path=/; max-age=${30 * 86_400}; samesite=lax`;
      }
    }

    const justSignedUp = readCookie(SIGNUP_COOKIE) === "1";
    if (!marketing && !justSignedUp) return;
    const fbq = loadPixel();
    fbq("track", "PageView");
    if (justSignedUp) {
      fbq("track", "CompleteRegistration");
      document.cookie = `${SIGNUP_COOKIE}=; path=/; max-age=0; samesite=lax`;
    }
  }, [pathname]);

  return null;
}
