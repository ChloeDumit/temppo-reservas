"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useSheetClose } from "@/components/app/sheet-form";
import { saveAddOnAction, type ActionState } from "./actions";

export type AddOnValues = { id?: string; name: string; serviceId: string; durationMin: number; price: string };

export function AddOnForm({
  values,
  currency,
  services,
}: {
  values: AddOnValues;
  currency: string;
  services: { id: string; name: string }[];
}) {
  const t = useTranslations("services");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const closeSheet = useSheetClose();
  const [state, submit] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await saveAddOnAction(prev, formData);
    if (result?.ok) closeSheet();
    return result;
  }, null);

  return (
    <form action={submit} className="space-y-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <Field label={t("name")}>
        <Input name="name" required maxLength={80} defaultValue={values.name} placeholder={t("addOnPlaceholder")} />
      </Field>
      <Field label={t("addOnFor")}>
        <Select name="serviceId" defaultValue={values.serviceId}>
          <option value="">{t("addOnAll")}</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t("extraTime")} hint={t("minutes")}>
          <Input name="durationMin" type="number" min={0} max={240} step={5} defaultValue={values.durationMin} />
        </Field>
        <Field
          label={`${t("extraPrice")} (${currency})`}
          error={state?.error === "priceInvalid" ? te("priceInvalid") : undefined}
        >
          <Input name="price" inputMode="decimal" defaultValue={values.price} placeholder="300" />
        </Field>
      </div>
      <SubmitButton pendingLabel={tc("saving")}>{tc("save")}</SubmitButton>
    </form>
  );
}
