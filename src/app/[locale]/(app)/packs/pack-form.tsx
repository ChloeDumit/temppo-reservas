"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useSheetClose } from "@/components/app/sheet-form";
import { savePackAction, type ActionState } from "./actions";

export type PackValues = {
  id?: string;
  name: string;
  description: string;
  credits: number;
  isUnlimited: boolean;
  price: string;
  validityDays: number;
};

export function PackForm({ values, currency }: { values: PackValues; currency: string }) {
  const t = useTranslations("packs");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const [unlimited, setUnlimited] = useState(values.isUnlimited);
  const closeSheet = useSheetClose();
  const [state, submit] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await savePackAction(prev, formData);
    if (result?.ok) closeSheet();
    return result;
  }, null);

  const message = state?.error
    ? state.error === "priceInvalid"
      ? te("priceInvalid")
      : te("generic")
    : undefined;

  return (
    <form action={submit} className="space-y-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}

      <Field label={t("name")}>
        <Input name="name" required maxLength={80} defaultValue={values.name} placeholder="8 clases / mes" />
      </Field>
      <Field label={t("description")}>
        <Textarea name="description" maxLength={300} defaultValue={values.description} />
      </Field>

      <label className="flex items-center gap-2.5 text-sm text-ink">
        <input
          type="checkbox"
          name="isUnlimited"
          checked={unlimited}
          onChange={(event) => setUnlimited(event.target.checked)}
          className="size-4 accent-[var(--color-accent)]"
        />
        {t("unlimited")}
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("credits")}>
          <Input
            name="credits"
            type="number"
            min={unlimited ? 0 : 1}
            max={500}
            disabled={unlimited}
            defaultValue={values.credits}
          />
        </Field>
        <Field label={`${t("price")} (${currency})`} error={message}>
          <Input name="price" required inputMode="decimal" defaultValue={values.price} placeholder="3200" />
        </Field>
        <Field label={t("validityDays")}>
          <Input
            name="validityDays"
            type="number"
            min={1}
            max={730}
            required
            defaultValue={values.validityDays}
          />
        </Field>
      </div>

      <SubmitButton pendingLabel={tc("saving")}>{tc("save")}</SubmitButton>
    </form>
  );
}
