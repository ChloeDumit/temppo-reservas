"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { setPasswordAction, type PasswordState } from "./actions";

export function PasswordForm() {
  const t = useTranslations("password");
  const tc = useTranslations("common");
  const [state, submit] = useActionState<PasswordState, FormData>(setPasswordAction, null);

  return (
    <form action={submit} className="space-y-4">
      <Field label={t("newPassword")} hint={t("hint")}>
        <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
      </Field>

      <Field
        label={t("confirm")}
        error={state?.error ? t(state.error) : undefined}
      >
        <Input name="confirm" type="password" required autoComplete="new-password" />
      </Field>

      <SubmitButton className="w-full" pendingLabel={tc("saving")}>
        {t("save")}
      </SubmitButton>
    </form>
  );
}
