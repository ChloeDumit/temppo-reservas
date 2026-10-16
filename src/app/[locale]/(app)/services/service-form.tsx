"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useSheetClose } from "@/components/app/sheet-form";
import { saveServiceAction, type ActionState } from "./actions";

export type ServiceValues = {
  id?: string;
  name: string;
  description: string;
  categoryId: string;
  durationMin: number;
  price: string;
  depositType: "NONE" | "PERCENT" | "FIXED";
  depositValue: string;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  rebookAfterDays: string;
  staffIds: string[];
};

export function ServiceForm({
  values,
  currency,
  categories,
  staff,
}: {
  values: ServiceValues;
  currency: string;
  categories: { id: string; name: string }[];
  staff: { id: string; name: string }[];
}) {
  const t = useTranslations("services");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const [depositType, setDepositType] = useState(values.depositType);
  const closeSheet = useSheetClose();
  const [state, submit] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await saveServiceAction(prev, formData);
    if (result?.ok) closeSheet();
    return result;
  }, null);

  const error = state?.error;

  return (
    <form action={submit} className="space-y-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}

      <Field label={t("name")}>
        <Input name="name" required maxLength={80} defaultValue={values.name} placeholder={t("namePlaceholder")} />
      </Field>

      {categories.length > 0 && (
        <Field label={t("category")}>
          <Select name="categoryId" defaultValue={values.categoryId}>
            <option value="">{t("noCategory")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label={t("duration")} hint={t("minutes")}>
          <Input name="durationMin" type="number" min={5} max={720} step={5} required defaultValue={values.durationMin} />
        </Field>
        <Field label={`${t("price")} (${currency})`} error={error === "priceInvalid" ? te("priceInvalid") : undefined}>
          <Input name="price" required inputMode="decimal" defaultValue={values.price} placeholder="1200" />
        </Field>
      </div>

      <fieldset className="space-y-3 rounded-[var(--radius-md)] bg-sunken p-3">
        <legend className="sr-only">{t("deposit")}</legend>
        <Field label={t("deposit")} hint={t("depositHint")}>
          <Select
            name="depositType"
            value={depositType}
            onChange={(e) => setDepositType(e.target.value as ServiceValues["depositType"])}
          >
            <option value="NONE">{t("depositNone")}</option>
            <option value="PERCENT">{t("depositPercent")}</option>
            <option value="FIXED">{t("depositFixed")}</option>
          </Select>
        </Field>
        {depositType !== "NONE" && (
          <Field
            label={depositType === "PERCENT" ? t("depositPercentLabel") : `${t("depositAmount")} (${currency})`}
            error={error === "depositInvalid" ? t("depositInvalid") : undefined}
          >
            <Input
              name="depositValue"
              required
              inputMode="decimal"
              defaultValue={values.depositType === depositType ? values.depositValue : ""}
              placeholder={depositType === "PERCENT" ? "30" : "400"}
            />
          </Field>
        )}
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <Field label={t("bufferBefore")} hint={t("minutes")}>
          <Input name="bufferBeforeMin" type="number" min={0} max={240} step={5} defaultValue={values.bufferBeforeMin} />
        </Field>
        <Field label={t("bufferAfter")} hint={t("minutes")}>
          <Input name="bufferAfterMin" type="number" min={0} max={240} step={5} defaultValue={values.bufferAfterMin} />
        </Field>
      </div>

      <Field label={t("rebookAfter")} hint={t("rebookHint")}>
        <Input name="rebookAfterDays" type="number" min={1} max={365} defaultValue={values.rebookAfterDays} placeholder="21" />
      </Field>

      {staff.length > 1 && (
        <Field label={t("whoDoesIt")} hint={t("whoDoesItHint")}>
          <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
            {staff.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  name="staffIds"
                  value={s.id}
                  defaultChecked={values.staffIds.includes(s.id)}
                  className="size-4 accent-[var(--color-accent)]"
                />
                {s.name}
              </label>
            ))}
          </div>
        </Field>
      )}

      <Field label={t("description")}>
        <Textarea name="description" maxLength={300} defaultValue={values.description} />
      </Field>

      {error && error !== "priceInvalid" && error !== "depositInvalid" && (
        <p className="text-sm text-critical">{te("generic")}</p>
      )}
      <SubmitButton pendingLabel={tc("saving")}>{tc("save")}</SubmitButton>
    </form>
  );
}
