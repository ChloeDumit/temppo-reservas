"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { Sheet } from "@/components/ui/sheet";
import { Icon } from "./icon";
import { PushToggle } from "./push-toggle";

type Item = { id: string; kind: string; title: string; body: string; url: string | null; readAt: string | null; createdAt: string };

const POLL_MS = 30_000;

/**
 * The bell in the staff panel: new bookings, cancellations, deposits.
 *
 * It asks the server every half minute while the panel is open, and again
 * the moment the tab comes back into view — a tablet on the counter all day
 * is exactly the case — and announces anything new with a toast. Push is for
 * when the panel is closed; this is for when it is not.
 */
const InboxContext = createContext<{ unread: number; open: () => void } | null>(null);

/** One per page: polls, holds the list, shows the sheet and the toasts. */
export function InboxProvider({
  pushKey,
  enabled = true,
  children,
}: {
  pushKey: string;
  /** Off for clients: the bell is a staff tool. */
  enabled?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("inbox");
  const locale = useLocale();
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<Item[]>([]);
  const router = useRouter();
  // Nothing loaded before this page opened is news.
  const newestSeen = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items: Item[]; unread: number };
      setItems(data.items);
      setUnread(data.unread);
      const newest = data.items[0]?.createdAt ?? null;
      if (newestSeen.current !== null && newest) {
        const fresh = data.items.filter((i) => i.createdAt > newestSeen.current! && !i.readAt);
        if (fresh.length) {
          setToasts((current) => [...fresh.slice(0, 3), ...current].slice(0, 3));
          // Something happened: bring the page itself up to date too, so the
          // new booking is already on the agenda and the home widgets.
          router.refresh();
        }
      }
      if (newest && (newestSeen.current === null || newest > newestSeen.current)) newestSeen.current = newest;
      if (newestSeen.current === null) newestSeen.current = "";
    } catch {
      // Offline for a moment; the next tick tries again.
    }
  }, [router]);

  useEffect(() => {
    if (!enabled) return;
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, enabled]);

  // Toasts step aside on their own.
  useEffect(() => {
    if (!toasts.length) return;
    const timer = setTimeout(() => setToasts((current) => current.slice(0, -1)), 15_000);
    return () => clearTimeout(timer);
  }, [toasts]);

  const markRead = async (ids?: string[]) => {
    await fetch("/api/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ids ? { ids } : {}),
    }).catch(() => null);
    load();
  };

  const ago = (iso: string) => {
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    if (minutes < 60) return rtf.format(-Math.max(minutes, 0), "minute");
    if (minutes < 60 * 24) return rtf.format(-Math.round(minutes / 60), "hour");
    return rtf.format(-Math.round(minutes / 1440), "day");
  };

  return (
    <InboxContext.Provider value={enabled ? { unread, open: () => setOpen(true) } : null}>
      {children}
      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          if (unread) markRead();
        }}
        title={t("title")}
      >
        <div className="space-y-4">
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">{t("empty")}</p>
          ) : (
            <ul className="-mx-1 divide-y divide-line">
              {items.map((item) => {
                const content = (
                  <>
                    <span className="flex items-start justify-between gap-3">
                      <span className={cn("text-sm", item.readAt ? "text-ink-soft" : "font-semibold text-ink")}>{item.title}</span>
                      <span className="shrink-0 text-xs text-muted">{ago(item.createdAt)}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{item.body}</span>
                  </>
                );
                return (
                  <li key={item.id} className="relative">
                    {!item.readAt && <span className="absolute left-0 top-4 size-2 rounded-full bg-accent" aria-hidden />}
                    {item.url ? (
                      <Link
                        href={item.url}
                        onClick={() => {
                          setOpen(false);
                          markRead([item.id]);
                        }}
                        className="block rounded-md py-3 pl-4 pr-1 hover:bg-sunken"
                      >
                        {content}
                      </Link>
                    ) : (
                      <div className="py-3 pl-4 pr-1">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="space-y-2 rounded-[var(--radius-md)] bg-sunken p-3">
            <p className="text-sm text-ink-soft">{t("pushHint")}</p>
            <PushToggle publicKey={pushKey} />
          </div>
        </div>
      </Sheet>

      {/* New while the panel is open: say so without taking over the screen. */}
      <div className="pointer-events-none fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-5 sm:items-end">
        {toasts.map((item) => (
          <div
            key={item.id}
            role="status"
            className="pointer-events-auto w-full max-w-sm rounded-[var(--radius-lg)] border border-line bg-surface p-3.5 shadow-[var(--shadow-lift)]"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                <Icon name="bell" className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{item.title}</p>
                <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">{item.body}</p>
                {item.url && (
                  <Link
                    href={item.url}
                    onClick={() => {
                      setToasts((current) => current.filter((x) => x.id !== item.id));
                      markRead([item.id]);
                    }}
                    className="mt-1.5 inline-block text-sm font-medium text-accent"
                  >
                    {t("open")} →
                  </Link>
                )}
              </div>
              <button
                type="button"
                onClick={() => setToasts((current) => current.filter((x) => x.id !== item.id))}
                aria-label={t("dismiss")}
                className="text-muted hover:text-ink"
              >
                <Icon name="x" className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </InboxContext.Provider>
  );
}

/** The bell itself; there can be one in the phone header and one in the sidebar. */
export function InboxBell({ className }: { className?: string }) {
  const t = useTranslations("inbox");
  const inbox = useContext(InboxContext);
  if (!inbox) return null;
  const { unread } = inbox;
  return (
    <button
      type="button"
      onClick={inbox.open}
      aria-label={unread ? t("labelUnread", { count: unread }) : t("label")}
      className={cn("pressable relative grid size-10 place-items-center rounded-full text-ink-soft hover:bg-sunken hover:text-ink", className)}
    >
      <Icon name="bell" className="size-[20px]" />
      {unread > 0 && (
        <span className="absolute right-1 top-1 grid min-w-[18px] place-items-center rounded-full bg-critical px-1 text-[10px] font-semibold leading-[18px] text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}
