"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useSheetClose } from "@/components/app/sheet-form";
import { assignStandingSpotAction, type ActionState } from "./actions";

export function AssignStandingSpotForm({
  classTemplateId,
  students,
  today,
  weekdays,
  defaultWeekday,
  weekdayLabels,
}: {
  classTemplateId: string;
  students: { id: string; name: string }[];
  today: string;
  /** Every weekday this class runs on. */
  weekdays: number[];
  /** The day whose card was tapped — ticked by default. */
  defaultWeekday: number;
  weekdayLabels: string[];
}) {
  const t = useTranslations("availability");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const closeSheet = useSheetClose();

  const [state, submit] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await assignStandingSpotAction(prev, formData);
    if (result?.ok) closeSheet();
    return result;
  }, null);

  const message = state?.error
    ? state.error === "slotFull"
      ? t("slotFull")
      : state.error === "alreadyFixed"
        ? t("alreadyFixed")
        : state.error === "noWeekdays"
          ? t("noWeekdays")
        : te("generic")
    : undefined;

  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="classTemplateId" value={classTemplateId} />

      {/*
        A class running Mon/Wed/Fri is one template, but a student may hold
        only some of those days. Only shown when there is a choice to make.
      */}
      {weekdays.length > 1 && (
        <Field label={t("whichDays")} hint={t("whichDaysHint")}>
          <div className="flex flex-wrap gap-2">
            {weekdays.map((day) => (
              <label
                key={day}
                className="pressable inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-pill)] border border-line-strong px-3.5 py-2 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent-ink"
              >
                <input
                  type="checkbox"
                  name="weekdays"
                  value={day}
                  defaultChecked={day === defaultWeekday}
                  className="size-4 accent-[var(--color-accent)]"
                />
                {weekdayLabels[day]}
              </label>
            ))}
          </div>
        </Field>
      )}

      <Field label={t("student")}>
        <Select name="studentId" required defaultValue="">
          <option value="" disabled>
            {t("student")}
          </option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("from")}>
          <Input name="startDate" type="date" required defaultValue={today} />
        </Field>
        <Field label={t("until")} hint={t("noEnd")}>
          <Input name="endDate" type="date" />
        </Field>
      </div>

      <Field label={t("note")} error={message}>
        <Textarea name="note" maxLength={200} />
      </Field>

      <p className="text-xs text-muted">{t("hint")}</p>

      <SubmitButton className="w-full" pendingLabel={tc("saving")}>
        {t("assign")}
      </SubmitButton>
    </form>
  );
}
