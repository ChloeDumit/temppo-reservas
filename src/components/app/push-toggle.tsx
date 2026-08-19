"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Icon } from "./icon";
import { savePushSubscriptionAction, removePushSubscriptionAction } from "@/app/[locale]/(app)/push-actions";

/** VAPID keys travel as base64url; the browser wants raw bytes. */
function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type State = "loading" | "unsupported" | "denied" | "off" | "on" | "working";

export function PushToggle({
  publicKey,
  basePath = "",
}: {
  publicKey: string;
  /** Deployment sub-path, so the worker registers under the right scope. */
  basePath?: string;
}) {
  const swUrl = `${basePath}/sw.js`;
  const t = useTranslations("push");
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    // Push needs a service worker, the Push API, and a secure context.
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !publicKey
    ) {
      setState("unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }

    navigator.serviceWorker
      .register(swUrl)
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? "on" : "off"))
      .catch(() => setState("unsupported"));
  }, [publicKey, swUrl]);

  async function enable() {
    setState("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const reg = await navigator.serviceWorker.register(swUrl);
      await navigator.serviceWorker.ready;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      const json = sub.toJSON();
      await savePushSubscriptionAction({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        userAgent: navigator.userAgent.slice(0, 200),
      });

      setState("on");
    } catch {
      setState("off");
    }
  }

  async function disable() {
    setState("working");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setState("on");
    }
  }

  if (state === "loading") return null;

  if (state === "unsupported") {
    return <p className="text-xs text-muted">{t("unsupported")}</p>;
  }

  if (state === "denied") {
    return <p className="text-xs text-caution">{t("blocked")}</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant={state === "on" ? "secondary" : "primary"}
        size="sm"
        disabled={state === "working"}
        onClick={state === "on" ? disable : enable}
      >
        <Icon name={state === "on" ? "check" : "alert"} className="size-4" />
        {state === "on" ? t("enabled") : t("enable")}
      </Button>
      {state === "on" && <span className="text-xs text-muted">{t("enabledHint")}</span>}
    </div>
  );
}
