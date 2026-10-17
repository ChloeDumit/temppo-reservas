"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveBookingRulesAction, type ActionState } from "./actions";

export type Rules = {
  minNoticeMinutes: number;
  bookingOpensDaysAhead: number;
  slotStepMinutes: number;
  cancellationCutoffHours: number;
  holdMinutes: number;
  depositRefundable: boolean;
};

export function RulesForm({ rules }: { rules: Rules }) {
  const t = useTranslations("hours");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const [state, submit] = useActionState<ActionState, FormData>(saveBookingRulesAction, null);

  return (
    <form action={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("minNotice")} hint={t("minNoticeHint")}>
          <Select name="minNoticeMinutes" defaultValue={String(rules.minNoticeMinutes)}>
            {[0, 30, 60, 120, 240, 720, 1440].map((m) => (
              <option key={m} value={m}>
                {m === 0 ? t("noNotice") : m < 60 ? `${m} min` : t("hoursCount", { count: m / 60 })}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("opensAhead")} hint={t("opensAheadHint")}>
          <Input name="bookingOpensDaysAhead" type="number" min={1} max={365} defaultValue={rules.bookingOpensDaysAhead} />
        </Field>
        <Field label={t("step")} hint={t("stepHint")}>
          <Select name="slotStepMinutes" defaultValue={String(rules.slotStepMinutes)}>
            {[5, 10, 15, 20, 30, 60].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("cutoff")} hint={t("cutoffHint")}>
          <Input name="cancellationCutoffHours" type="number" min={0} max={336} defaultValue={rules.cancellationCutoffHours} />
        </Field>
        <Field label={t("hold")} hint={t("holdHint")}>
          <Input name="holdMinutes" type="number" min={5} max={1440} defaultValue={rules.holdMinutes} />
        </Field>
      </div>
      <label className="flex items-start gap-2.5 text-sm text-ink">
        <input
          type="checkbox"
          name="depositRefundable"
          defaultChecked={rules.depositRefundable}
          className="mt-0.5 size-4 accent-[var(--color-accent)]"
        />
        <span>
          {t("refundable")}
          <span className="block text-xs text-muted">{t("refundableHint")}</span>
        </span>
      </label>
      {state?.error && <p className="text-sm text-critical">{te("generic")}</p>}
      {state?.ok && <p className="text-sm text-positive">{t("saved")}</p>}
      <SubmitButton pendingLabel={tc("saving")}>{tc("save")}</SubmitButton>
    </form>
  );
}
