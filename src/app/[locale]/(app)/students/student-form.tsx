"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { useSheetClose } from "@/components/app/sheet-form";
import { saveStudentAction, type ActionState } from "./actions";

export type StudentValues = {
  id?: string;
  name: string;
  email: string;
  phone: string;
  birthDate: string;
  healthNotes: string;
  emergencyContact: string;
  emergencyPhone: string;
  notes: string;
};

export function StudentForm({ values }: { values: StudentValues }) {
  const t = useTranslations("students");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const ta = useTranslations("auth");
  // No-op outside a sheet, closes it when there is one.
  const closeSheet = useSheetClose();
  const [state, submit] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await saveStudentAction(prev, formData);
    // Stay open when a password was issued — closing would destroy the only
    // copy of it. Edits with nothing to hand over still close as before.
    if (result?.ok && !result.tempPassword) closeSheet();
    return result;
  }, null);

  if (state?.ok && state.tempPassword) {
    return (
      <div className="space-y-4">
        <div className="rounded-[var(--radius-lg)] bg-positive-soft px-4 py-3 text-sm text-positive">
          {t("created")}
        </div>

        <div className="rounded-[var(--radius-lg)] border border-line bg-sunken px-4 py-4 text-center">
          <p className="text-xs uppercase tracking-wide text-muted">{t("tempPasswordTitle")}</p>
          <p className="mt-1.5 font-display text-3xl font-bold tracking-wider text-accent">
            {state.tempPassword}
          </p>
          <p className="mt-2 text-xs text-muted">{t("tempPasswordHint")}</p>
        </div>

        <p className="rounded-md bg-caution-soft px-3 py-2 text-xs text-caution">
          {t("tempPasswordOnce")}
        </p>

        <Button type="button" variant="secondary" className="w-full" onClick={closeSheet}>
          {tc("done")}
        </Button>
      </div>
    );
  }

  const message = state?.error
    ? state.error === "emailTaken"
      ? ta("emailTaken")
      : state.error === "invalidEmail"
        ? te("invalidEmail")
        : te("generic")
    : undefined;

  return (
    <form action={submit} className="space-y-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("name")}>
          <Input name="name" required maxLength={80} defaultValue={values.name} />
        </Field>
        <Field label={t("email")} error={message}>
          <Input name="email" type="email" required defaultValue={values.email} />
        </Field>
        <Field label={t("phone")} hint="+598…">
          <Input name="phone" type="tel" maxLength={30} defaultValue={values.phone} />
        </Field>
        <Field label={t("birthDate")}>
          <Input name="birthDate" type="date" defaultValue={values.birthDate} />
        </Field>
        <Field label={t("emergencyContact")}>
          <Input name="emergencyContact" maxLength={120} defaultValue={values.emergencyContact} />
        </Field>
        <Field label={t("emergencyPhone")}>
          <Input name="emergencyPhone" type="tel" maxLength={30} defaultValue={values.emergencyPhone} />
        </Field>
      </div>

      <Field label={t("healthNotes")}>
        <Textarea name="healthNotes" maxLength={1000} defaultValue={values.healthNotes} />
      </Field>
      <Field label={t("notes")}>
        <Textarea name="notes" maxLength={1000} defaultValue={values.notes} />
      </Field>

      <SubmitButton pendingLabel={tc("saving")}>{tc("save")}</SubmitButton>
    </form>
  );
}
