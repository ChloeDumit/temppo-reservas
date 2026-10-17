"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useSheetClose } from "@/components/app/sheet-form";
import { createTimeOffAction, type ActionState } from "./actions";

export function TimeOffForm({
  staff,
  defaultStaffId,
  canCloseStudio,
  today,
}: {
  staff: { id: string; name: string }[];
  defaultStaffId: string;
  canCloseStudio: boolean;
  today: string;
}) {
  const t = useTranslations("hours");
  const tc = useTranslations("common");
  const closeSheet = useSheetClose();
  const [state, submit] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await createTimeOffAction(prev, formData);
    if (result?.ok) closeSheet();
    return result;
  }, null);

  return (
    <form action={submit} className="space-y-4">
      <Field label={t("who")}>
        <Select name="staffId" defaultValue={defaultStaffId}>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          {canCloseStudio && <option value="">{t("wholeStudio")}</option>}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("fromDay")}>
          <Input type="date" name="fromDate" required defaultValue={today} />
        </Field>
        <Field label={t("fromHour")}>
          <Input type="time" name="fromTime" required defaultValue="00:00" />
        </Field>
        <Field label={t("toDay")}>
          <Input type="date" name="toDate" required defaultValue={today} />
        </Field>
        <Field label={t("toHour")}>
          <Input type="time" name="toTime" required defaultValue="23:59" />
        </Field>
      </div>
      <Field label={t("reason")}>
        <Input name="reason" maxLength={120} placeholder={t("reasonPlaceholder")} />
      </Field>
      {state?.error && <p className="text-sm text-critical">{t("badRange")}</p>}
      <SubmitButton pendingLabel={tc("saving")}>{t("block")}</SubmitButton>
    </form>
  );
}
