"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveHoursAction, type ActionState } from "./actions";

export type DayShifts = { from: string; to: string }[];

// Monday first: that is how a working week reads here.
const ORDER = [1, 2, 3, 4, 5, 6, 0];

export function HoursForm({
  staffId,
  week,
  dayNames,
}: {
  staffId: string;
  /** Index = weekday (0 Sunday). */
  week: DayShifts[];
  dayNames: string[];
}) {
  const t = useTranslations("hours");
  const tc = useTranslations("common");
  const [split, setSplit] = useState(() => week.map((d) => d.length > 1));
  const [open, setOpen] = useState(() => week.map((d) => d.length > 0));
  const [state, submit] = useActionState<ActionState, FormData>(saveHoursAction, null);

  return (
    <form action={submit} className="space-y-2">
      <input type="hidden" name="staffId" value={staffId} />
      {ORDER.map((d) => (
        <div key={d} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-md)] px-1 py-1.5">
          <label className="flex w-28 items-center gap-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={open[d]}
              onChange={(e) => setOpen((o) => o.map((v, i) => (i === d ? e.target.checked : v)))}
              className="size-4 accent-[var(--color-accent)]"
            />
            {dayNames[d]}
          </label>

          {open[d] ? (
            // Remounted when the day is split or joined, so the defaults below
            // apply: a new split ends the morning at 13:00 instead of
            // overlapping the afternoon it just added.
            <div key={String(split[d])} className="flex flex-wrap items-center gap-2">
              {[1, 2].map((n) =>
                n === 2 && !split[d] ? null : (
                  <span key={n} className="flex items-center gap-1.5">
                    <Input
                      type="time"
                      name={`d${d}s${n}from`}
                      required
                      defaultValue={week[d][n - 1]?.from ?? (n === 1 ? "09:00" : "15:00")}
                      className="w-[6.5rem]"
                      aria-label={t("from")}
                    />
                    <span className="text-muted">–</span>
                    <Input
                      type="time"
                      name={`d${d}s${n}to`}
                      required
                      defaultValue={
                        n === 1 && split[d] && week[d].length < 2
                          ? "13:00"
                          : (week[d][n - 1]?.to ?? (n === 1 && split[d] ? "13:00" : "19:00"))
                      }
                      className="w-[6.5rem]"
                      aria-label={t("to")}
                    />
                  </span>
                ),
              )}
              <button
                type="button"
                onClick={() => setSplit((s) => s.map((v, i) => (i === d ? !v : v)))}
                className="text-xs font-medium text-accent underline-offset-4 hover:underline"
              >
                {split[d] ? t("oneShift") : t("splitShift")}
              </button>
            </div>
          ) : (
            <span className="text-sm text-muted">{t("closed")}</span>
          )}
        </div>
      ))}
      {state?.error && <p className="text-sm text-critical">{t("badShift")}</p>}
      {state?.ok && <p className="text-sm text-positive">{t("saved")}</p>}
      <SubmitButton pendingLabel={tc("saving")}>{tc("save")}</SubmitButton>
    </form>
  );
}
