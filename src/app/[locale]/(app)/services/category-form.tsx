"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useSheetClose } from "@/components/app/sheet-form";
import { createCategoryAction, type ActionState } from "./actions";

export function CategoryForm() {
  const t = useTranslations("services");
  const tc = useTranslations("common");
  const closeSheet = useSheetClose();
  const [, submit] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await createCategoryAction(prev, formData);
    if (result?.ok) closeSheet();
    return result;
  }, null);

  return (
    <form action={submit} className="space-y-4">
      <Field label={t("categoryName")}>
        <Input name="name" required maxLength={60} placeholder={t("categoryPlaceholder")} />
      </Field>
      <SubmitButton pendingLabel={tc("saving")}>{tc("save")}</SubmitButton>
    </form>
  );
}
