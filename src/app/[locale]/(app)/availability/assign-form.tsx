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
}: {
  classTemplateId: string;
  students: { id: string; name: string }[];
  today: string;
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
        : te("generic")
    : undefined;

  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="classTemplateId" value={classTemplateId} />

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
