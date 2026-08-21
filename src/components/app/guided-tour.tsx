"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import type { Role } from "@/generated/prisma/enums";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { Mascot } from "@/components/brand";
import { markTourSeenAction } from "@/app/[locale]/(app)/tour-actions";

const SEEN_KEY = "temppo:tour-seen";

/** Storage throws in private windows; a missing guard must never break the app. */
function readSeen() {
  try {
    return Boolean(localStorage.getItem(SEEN_KEY));
  } catch {
    return false;
  }
}

function writeSeen() {
  try {
    localStorage.setItem(SEEN_KEY, String(Date.now()));
  } catch {
    // Storage unavailable — the account record still carries the flag.
  }
}

type Step = {
  /** Message key under the `tour` namespace. */
  key: string;
  /** data-tour value to spotlight. Omitted for a centred, full-screen step. */
  target?: string;
};

/*
  Follows the tab bar left to right, so the tour reads as a tour of what is on
  screen. Everything behind "Más" gets named in that one step rather than a
  step each — seven more cards would be a chore, but leaving them unnamed hid
  Clases, which is where the whole timetable is set up.
*/
const STAFF_STEPS: Step[] = [
  { key: "welcomeStaff" },
  { key: "panel", target: "tab:/dashboard" },
  { key: "schedule", target: "tab:/schedule" },
  { key: "checkin", target: "tab:/checkin" },
  { key: "spots", target: "tab:/availability" },
  { key: "more", target: "tab:more" },
  { key: "done" },
];

const STUDENT_STEPS: Step[] = [
  { key: "welcomeStudent" },
  { key: "myClasses", target: "tab:/my" },
  { key: "book", target: "tab:/book" },
  { key: "buy", target: "tab:/buy" },
  { key: "account", target: "tab:more" },
  { key: "doneStudent" },
];

type Rect = { top: number; left: number; width: number; height: number };

/**
 * First-run walkthrough.
 *
 * Spotlights real navigation rather than showing screenshots, so what people
 * are told maps onto what they are looking at. Steps whose target is missing
 * for this role are dropped rather than pointing at nothing.
 */
export function GuidedTour({
  role,
  alreadySeen,
}: {
  role: Role;
  /** From the account record — the durable answer to "has this run before". */
  alreadySeen: boolean;
}) {
  const t = useTranslations("tour");
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);

  const steps = role === "STUDENT" ? STUDENT_STEPS : STAFF_STEPS;
  const step = steps[index];

  useEffect(() => {
    if (alreadySeen || readSeen()) return;

    // Let the tab bar paint before measuring it.
    const timer = setTimeout(() => {
      setRunning(true);
      // Stamp on open, so abandoning it halfway does not bring it back.
      writeSeen();
      void markTourSeenAction();
    }, 600);

    return () => clearTimeout(timer);
  }, [alreadySeen]);

  // Listen for a manual restart from the account sheet.
  useEffect(() => {
    const open = () => {
      setIndex(0);
      setRunning(true);
    };
    window.addEventListener("temppo:start-tour", open);
    return () => window.removeEventListener("temppo:start-tour", open);
  }, []);

  const measure = useCallback(() => {
    if (!running || !step?.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [running, step]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  useEffect(() => {
    if (!running) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [running]);

  if (!running || typeof document === "undefined") return null;

  const finish = () => {
    writeSeen();
    setRunning(false);
    setIndex(0);
  };

  const next = () => (index < steps.length - 1 ? setIndex(index + 1) : finish());
  const back = () => setIndex(Math.max(0, index - 1));

  // Keep the card clear of the highlight: above it when the target sits low.
  const targetIsLow = rect ? rect.top > window.innerHeight / 2 : false;

  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={t("label")}>
      {/*
        The dim layer is the spotlight: a transparent box over the target with
        an enormous shadow, which darkens everything except the cut-out.
      */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-white/70 transition-all duration-300"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 9999px rgba(28,25,23,0.72)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-ink/72" />
      )}

      <div
        className={cn(
          "absolute inset-x-4 mx-auto max-w-sm rounded-[var(--radius-sheet)] bg-surface p-5 shadow-2xl",
          targetIsLow ? "bottom-auto" : "bottom-[max(1.5rem,env(safe-area-inset-bottom))]",
        )}
        style={
          targetIsLow && rect
            ? { top: Math.max(16, rect.top - 240) }
            : undefined
        }
      >
        <div className="flex items-start gap-3">
          {!step.target && <Mascot size={44} className="shrink-0" />}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-ink">{t(`${step.key}.title`)}</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">{t(`${step.key}.body`)}</p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          {/* Progress dots double as the step count. */}
          <span className="flex items-center gap-1.5" aria-hidden>
            {steps.map((s, i) => (
              <span
                key={s.key}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === index ? "w-5 bg-accent" : "w-1.5 bg-line-strong",
                )}
              />
            ))}
          </span>

          <span className="flex items-center gap-1">
            {index > 0 && (
              <button
                type="button"
                onClick={back}
                className="pressable touch-target rounded-md px-3 text-sm text-ink-soft"
              >
                {t("back")}
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="pressable touch-target inline-flex items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-medium text-white"
            >
              {index === steps.length - 1 ? t("finish") : t("next")}
              {index < steps.length - 1 && <Icon name="chevronRight" className="size-4" />}
            </button>
          </span>
        </div>

        {index < steps.length - 1 && (
          <button
            type="button"
            onClick={finish}
            className="mt-2 w-full rounded-md py-2 text-xs text-muted"
          >
            {t("skip")}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Re-opens the tour from anywhere. */
export function ReplayTourButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("temppo:start-tour"))}
      className="pressable touch-target inline-flex items-center gap-2 rounded-md px-3 text-sm text-ink-soft"
    >
      <Icon name="spark" className="size-4" />
      {label}
    </button>
  );
}
