"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input, Select } from "@/components/ui/field";
import { formatStartTimes, parseStartTimes } from "@/lib/appointments/fixed-times";

const STEPS = [5, 10, 15, 20, 30, 60];

/**
 * When a client's appointment can start: every so many minutes inside the
 * working hours, or only at the times the professional lists. The form gets
 * both fields as before — `slotStepMinutes` and `fixedStartTimes` — with the
 * list sent empty in the first mode.
 */
export function StartTimesField({ step, fixed }: { step: number; fixed: string }) {
  const t = useTranslations("hours");
  const [mode, setMode] = useState<"step" | "fixed">(fixed ? "fixed" : "step");
  const [times, setTimes] = useState<number[]>(() => parseStartTimes(fixed) ?? []);
  const [draft, setDraft] = useState("");

  const add = () => {
    const parsed = parseStartTimes(draft);
    if (!parsed?.length) return;
    setTimes((now) => [...new Set([...now, ...parsed])].sort((a, b) => a - b));
    setDraft("");
  };

  const option = (value: "step" | "fixed", label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={mode === value}
      onClick={() => setMode(value)}
      className={`flex-1 rounded-[var(--radius-pill)] px-3 py-1.5 text-sm font-medium transition-colors ${
        mode === value ? "bg-accent text-white shadow-sm" : "text-ink-soft hover:text-ink"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3 rounded-[var(--radius-md)] bg-sunken p-3 sm:col-span-2">
      <p className="text-sm font-medium text-ink-soft">{t("startMode")}</p>
      <div role="radiogroup" aria-label={t("startMode")} className="flex gap-1 rounded-[var(--radius-pill)] bg-surface p-1">
        {option("step", t("modeEvery"))}
        {option("fixed", t("modeFixed"))}
      </div>

      <input type="hidden" name="fixedStartTimes" value={mode === "fixed" ? formatStartTimes(times) : ""} />

      {mode === "step" ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-ink">
            <span className="whitespace-nowrap">{t("everyPrefix")}</span>
            <div className="w-32">
              <Select name="slotStepMinutes" defaultValue={String(step)}>
                {STEPS.map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted">{t("stepHint")}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* The step stays as it was, ready for if she switches back. */}
          <input type="hidden" name="slotStepMinutes" value={step} />
          {times.length ? (
            <ul className="flex flex-wrap gap-2">
              {times.map((m) => {
                const label = formatStartTimes([m]);
                return (
                  <li key={m} className="flex items-center gap-1 rounded-[var(--radius-pill)] bg-surface py-1 pl-3 pr-1 text-sm font-medium text-ink ring-1 ring-line-strong tabular-nums">
                    {label}
                    <button
                      type="button"
                      onClick={() => setTimes((now) => now.filter((x) => x !== m))}
                      aria-label={t("removeTime", { time: label })}
                      className="grid size-6 place-items-center rounded-full text-muted hover:bg-accent-soft hover:text-accent-ink"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">{t("fixedEmpty")}</p>
          )}
          <div className="flex gap-2">
            <Input
              type="time"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              aria-label={t("addTime")}
              className="min-w-0 flex-1 sm:max-w-40 sm:flex-none"
            />
            <button
              type="button"
              onClick={add}
              disabled={!draft}
              className="shrink-0 whitespace-nowrap rounded-[var(--radius-pill)] bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
            >
              + {t("addTime")}
            </button>
          </div>
          <p className="text-xs text-muted">{t("fixedStartsHint")}</p>
        </div>
      )}
    </div>
  );
}
