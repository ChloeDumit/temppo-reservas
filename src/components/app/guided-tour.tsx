"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { Role } from "@/generated/prisma/enums";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { Mascot } from "@/components/brand";
import { markTourSeenAction, tourProgressAction } from "@/app/[locale]/(app)/tour-actions";

/**
 * What the setup steps check themselves against.
 *
 * Declared here rather than beside the action: a "use server" module may only
 * export async functions, and a stray type export there takes the whole client
 * bundle down with it rather than failing where it was written.
 */
type TourProgress = {
  locations: number;
  teachers: number;
  packs: number;
  classes: number;
  students: number;
  spots: number;
};

const SEEN_KEY = "temppo:tour-seen";
/** Where the tour got to, so leaving the page to do a step does not lose it. */
const PLACE_KEY = "temppo:tour-place";

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

type Place = { index: number; open: boolean };

function readPlace(): Place | null {
  try {
    const raw = sessionStorage.getItem(PLACE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Place;
    return typeof parsed?.index === "number" ? parsed : null;
  } catch {
    return null;
  }
}

function writePlace(place: Place | null) {
  try {
    if (place) sessionStorage.setItem(PLACE_KEY, JSON.stringify(place));
    else sessionStorage.removeItem(PLACE_KEY);
  } catch {
    // Same as above: the tour still works, it just cannot be resumed.
  }
}

type Step = {
  /** Message key under the `tour` namespace. */
  key: string;
  /** Setup steps build the studio; daily steps are how it is run afterwards. */
  phase: "setup" | "daily";
  /** data-tour value to spotlight. Omitted for a centred, full-screen step. */
  target?: string;
  /** Where the step is carried out. Offered as "take me there". */
  href?: string;
  /** The count that decides whether this step is already done. */
  needs?: keyof TourProgress;
};

/*
  Setup runs in the order the data depends on itself, which is not the order the
  menu happens to be in: a class needs a teacher to assign and a room to be in,
  a student needs a pack to buy, and a standing spot needs both a class and the
  student who sits in it. Following the menu instead is how someone ends up
  building the whole timetable before noticing there is nobody to teach it.
*/
const SETUP_STEPS: Step[] = [
  { key: "welcomeStaff", phase: "setup" },
  { key: "studio", phase: "setup", href: "/settings" },
  { key: "rules", phase: "setup", href: "/settings" },
  { key: "locations", phase: "setup", href: "/settings", needs: "locations" },
  { key: "teachers", phase: "setup", href: "/settings", needs: "teachers" },
  { key: "packs", phase: "setup", href: "/packs", needs: "packs" },
  { key: "classes", phase: "setup", href: "/classes", needs: "classes" },
  { key: "students", phase: "setup", href: "/students", needs: "students" },
  { key: "spots", phase: "setup", href: "/availability", needs: "spots" },
];

/*
  Everything above is done once. Everything here is done every week, so it
  points at the tab bar the studio will actually be tapping.
*/
const DAILY_STEPS: Step[] = [
  { key: "panel", phase: "daily", target: "tab:/dashboard" },
  { key: "schedule", phase: "daily", target: "tab:/schedule" },
  { key: "checkin", phase: "daily", target: "tab:/checkin" },
  { key: "spotsDaily", phase: "daily", target: "tab:/availability" },
  { key: "more", phase: "daily", target: "tab:more" },
  { key: "payments", phase: "daily", href: "/payments" },
  { key: "reports", phase: "daily", href: "/reports" },
  { key: "done", phase: "daily" },
];

const STUDENT_STEPS: Step[] = [
  { key: "welcomeStudent", phase: "daily" },
  { key: "myClasses", phase: "daily", target: "tab:/my" },
  { key: "book", phase: "daily", target: "tab:/book" },
  { key: "buy", phase: "daily", target: "tab:/buy" },
  { key: "account", phase: "daily", target: "tab:more" },
  { key: "doneStudent", phase: "daily" },
];

/**
 * The steps this role can actually carry out.
 *
 * An instructor teaches; they cannot open settings, packs or students, so
 * walking them through setting those up would be a tour of locked doors.
 */
function stepsFor(role: Role): Step[] {
  if (role === "STUDENT") return STUDENT_STEPS;
  if (role === "OWNER" || role === "ADMIN") return [...SETUP_STEPS, ...DAILY_STEPS];
  return [{ key: "welcomeStaff", phase: "daily" }, ...DAILY_STEPS];
}

type Rect = { top: number; left: number; width: number; height: number };

/**
 * First-run walkthrough.
 *
 * Two halves. The first builds the studio — identity, rules, teachers, packs,
 * classes, students, standing spots — in the order those depend on each other,
 * and each step knows whether it has been done already, so a studio part way
 * through can see what is left rather than being told about it again.
 *
 * The second half spotlights real navigation rather than showing screenshots,
 * so what people are told maps onto what they are looking at.
 *
 * A step you can act on hands over: the overlay steps aside, the page it names
 * opens, and a pill offers to pick the tour back up. Anything else would mean
 * reading nine instructions and then trying to remember them.
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
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [progress, setProgress] = useState<TourProgress | null>(null);

  const steps = stepsFor(role);
  const step = steps[index];

  const loadProgress = useCallback(() => {
    void tourProgressAction()
      .then(setProgress)
      // A step simply shows no tick if the counts cannot be read.
      .catch(() => setProgress(null));
  }, []);

  // Resume where we left off, or open for the first time.
  useEffect(() => {
    const place = readPlace();
    if (place) {
      setIndex(Math.min(place.index, steps.length - 1));
      if (place.open) setRunning(true);
      else setPaused(true);
      loadProgress();
      return;
    }

    if (alreadySeen || readSeen()) return;

    // Let the tab bar paint before measuring it.
    const timer = setTimeout(() => {
      setRunning(true);
      loadProgress();
      // Stamp on open, so abandoning it halfway does not bring it back.
      writeSeen();
      void markTourSeenAction();
    }, 600);

    return () => clearTimeout(timer);
    // Only ever runs for the mount that starts or resumes the tour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for a manual restart from the account sheet.
  useEffect(() => {
    const open = () => {
      setIndex(0);
      setPaused(false);
      setRunning(true);
      loadProgress();
    };
    window.addEventListener("temppo:start-tour", open);
    return () => window.removeEventListener("temppo:start-tour", open);
  }, [loadProgress]);

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

  // Remember where we are, so leaving to carry out a step can come back to it.
  useEffect(() => {
    if (running) writePlace({ index, open: true });
  }, [index, running]);

  useEffect(() => {
    if (!running) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [running]);

  const finish = useCallback(() => {
    writeSeen();
    writePlace(null);
    setRunning(false);
    setPaused(false);
    setIndex(0);
  }, []);

  /*
    Moves relative to whatever the current step is rather than to a number
    captured when the button rendered, so two taps in the same frame advance
    two steps instead of both landing on the same one.
  */
  const move = (delta: number) =>
    setIndex((current) => Math.min(Math.max(0, current + delta), steps.length - 1));

  /** Hands the screen over so the step can actually be carried out. */
  const visit = (href: string) => {
    writePlace({ index, open: false });
    setRunning(false);
    setPaused(true);
    router.push(href);
  };

  const resume = () => {
    setPaused(false);
    setRunning(true);
    // The step may well have been completed while the tour was standing aside.
    loadProgress();
  };

  if (typeof document === "undefined") return null;

  // Waiting on the sidelines while the owner does the thing the step described.
  if (paused && !running) {
    return createPortal(
      <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] right-4 z-50 flex items-center gap-1 rounded-[var(--radius-pill)] bg-ink py-1 pl-1 pr-1 shadow-lg sm:bottom-6">
        <button
          type="button"
          onClick={resume}
          className="pressable inline-flex items-center gap-2 rounded-[var(--radius-pill)] px-3 py-2 text-sm font-medium text-white"
        >
          <Icon name="spark" className="size-4" />
          {t("resume")}
          <span className="tabular-nums text-white/60">
            {index + 1}/{steps.length}
          </span>
        </button>
        <button
          type="button"
          onClick={finish}
          aria-label={t("skip")}
          className="pressable rounded-full p-2 text-white/60"
        >
          <Icon name="x" className="size-4" />
        </button>
      </div>,
      document.body,
    );
  }

  if (!running || !step) return null;

  const isLast = index === steps.length - 1;
  const next = () => (isLast ? finish() : move(1));
  const back = () => move(-1);

  const stepDone = step.needs ? (progress?.[step.needs] ?? 0) > 0 : null;
  // A step worth acting on now: it has somewhere to go and isn't already done.
  const urges = Boolean(step.href) && stepDone !== true;

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
        style={targetIsLow && rect ? { top: Math.max(16, rect.top - 280) } : undefined}
      >
        {/*
          Sixteen dots would read as a punishment. A bar and a count say the
          same thing, and the phase name explains why it is that long.
        */}
        <div className="mb-4 flex items-center gap-3">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
            {t(step.phase === "setup" ? "phaseSetup" : "phaseDaily")}
          </span>
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-sunken" aria-hidden>
            <span
              className="block h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${((index + 1) / steps.length) * 100}%` }}
            />
          </span>
          <span className="text-[11px] tabular-nums text-muted">
            {index + 1}/{steps.length}
          </span>
        </div>

        <div className="flex items-start gap-3">
          {!step.target && <Mascot size={44} className="shrink-0" />}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-ink">{t(`${step.key}.title`)}</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">{t(`${step.key}.body`)}</p>

            {stepDone !== null && (
              <p
                className={cn(
                  "mt-2.5 inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-1 text-xs font-medium",
                  stepDone ? "bg-positive-soft text-positive" : "bg-sunken text-muted",
                )}
              >
                <Icon name={stepDone ? "check" : "clock"} className="size-3.5" />
                {stepDone ? t("stepDone") : t("stepPending")}
              </p>
            )}
          </div>
        </div>

        {/*
          The thing to actually go and do gets its own full-width row. Squeezed
          onto the same line as Atrás and Siguiente, "Agregar profe" wrapped
          over two lines on a phone and read as an afterthought.
        */}
        {step.href && (
          <button
            type="button"
            onClick={() => visit(step.href!)}
            className={cn(
              "pressable touch-target mt-4 flex w-full items-center justify-center gap-1.5 rounded-md px-4 text-sm font-medium",
              urges ? "bg-accent text-white" : "border border-line-strong text-ink-soft",
            )}
          >
            {t(`${step.key}.action`)}
            <Icon name="chevronRight" className="size-4" />
          </button>
        )}

        <div className="mt-2 flex items-center justify-end gap-1">
          {index > 0 && (
            <button
              type="button"
              onClick={back}
              className="pressable touch-target mr-auto rounded-md px-3 text-sm text-ink-soft"
            >
              {t("back")}
            </button>
          )}

          <button
            type="button"
            onClick={next}
            className={cn(
              "pressable touch-target inline-flex items-center gap-1.5 rounded-md px-4 text-sm font-medium",
              urges ? "text-ink-soft" : "bg-accent text-white",
            )}
          >
            {isLast ? t("finish") : t("next")}
            {!isLast && <Icon name="chevronRight" className="size-4" />}
          </button>
        </div>

        {!isLast && (
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
