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
  documentId: string;
  locationIds: string[];
  phone: string;
  birthDate: string;
  healthNotes: string;
  emergencyContact: string;
  emergencyPhone: string;
  notes: string;
};

export function StudentForm({
  values,
  locations = [],
}: {
  values: StudentValues;
  locations?: { id: string; name: string }[];
}) {
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

  const errorKey = state?.error;
  // Only the address-shaped problems belong under the email field; the cédula
  // and PIN ones sit under their own.
  const message =
    errorKey === "emailTaken"
      ? ta("emailTaken")
      : errorKey === "invalidEmail"
        ? te("invalidEmail")
        : errorKey === "needHandle"
          ? t("needHandle")
          : errorKey && !["documentTaken", "invalidPin", "pinRequired"].includes(errorKey)
            ? te("generic")
            : undefined;

  const documentMessage =
    errorKey === "documentTaken"
      ? t("documentTaken")
      : errorKey === "invalidPin"
        ? t("invalidPin")
        : errorKey === "pinRequired"
          ? t("pinRequired")
          : undefined;

  return (
    <form action={submit} className="space-y-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("name")}>
          <Input name="name" required maxLength={80} defaultValue={values.name} />
        </Field>
        <Field label={t("email")} hint={t("emailOptionalHint")} error={message}>
          <Input name="email" type="email" defaultValue={values.email} />
        </Field>
        <Field label={t("documentId")} hint={t("documentIdHint")} error={documentMessage}>
          <Input
            name="documentId"
            inputMode="numeric"
            maxLength={30}
            defaultValue={values.documentId}
            placeholder="1.234.567-8"
          />
        </Field>
        <Field label={t("pin")} hint={values.id ? t("pinEditHint") : t("pinHint")}>
          <Input name="pin" inputMode="numeric" maxLength={8} autoComplete="off" />
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

      {locations.length > 1 && (
        <Field label={tc("locationsLabel")} hint={t("locationsHint")}>
          <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
            {locations.map((location) => (
              <label key={location.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  name="locationIds"
                  value={location.id}
                  defaultChecked={values.locationIds.includes(location.id)}
                  className="size-4 accent-[var(--accent)]"
                />
                {location.name}
              </label>
            ))}
          </div>
        </Field>
      )}

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
