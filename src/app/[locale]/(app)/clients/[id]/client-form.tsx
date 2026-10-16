"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveClientAction, type ClientState } from "../actions";

export function ClientForm({
  values,
}: {
  values: { id: string; name: string; phone: string; email: string; allergies: string; notes: string };
}) {
  const t = useTranslations("clients");
  const tc = useTranslations("common");
  const [state, submit] = useActionState<ClientState, FormData>(saveClientAction, null);
  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="id" value={values.id} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("name")}>
          <Input name="name" required minLength={2} maxLength={80} defaultValue={values.name} />
        </Field>
        <Field label={t("phone")}>
          <Input name="phone" type="tel" maxLength={30} defaultValue={values.phone} />
        </Field>
        <Field label={t("email")} error={state?.error === "email" ? t("errEmail") : state?.error === "emailTaken" ? t("errEmailTaken") : undefined}>
          <Input name="email" type="email" defaultValue={values.email} />
        </Field>
      </div>
      <Field label={t("allergies")} hint={t("allergiesHint")}>
        <Input name="allergies" maxLength={500} defaultValue={values.allergies} placeholder={t("allergiesPlaceholder")} />
      </Field>
      <Field label={t("notes")} hint={t("notesHint")}>
        <Textarea name="notes" maxLength={2000} defaultValue={values.notes} placeholder={t("notesPlaceholder")} />
      </Field>
      {state?.ok && <p className="text-sm text-positive">{t("saved")}</p>}
      <SubmitButton pendingLabel={tc("saving")}>{tc("save")}</SubmitButton>
    </form>
  );
}
