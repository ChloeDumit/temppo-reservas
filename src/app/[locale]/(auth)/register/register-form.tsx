"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { registerAction, type AuthState } from "../actions";

/** `beauty` swaps the studio vocabulary for a beauty business's. */
export function RegisterForm({ beauty = false }: { beauty?: boolean }) {
  const t = useTranslations("auth");
  const k = (key: string) => (beauty ? `${key}Beauty` : key) as "registerTitle";
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const [state, submit] = useActionState<AuthState, FormData>(registerAction, null);

  const authErrors = ["emailTaken", "slugTaken", "accountInactive", "invalidCredentials"];
  const message = state?.error
    ? authErrors.includes(state.error)
      ? t(state.error)
      : te(state.error)
    : undefined;

  return (
    <div className="card px-5 py-6">
      <h1 className="text-xl">{t(k("registerTitle"))}</h1>
      <p className="mt-1 text-sm text-muted">{t("registerSubtitle")}</p>

      <form action={submit} className="mt-5 space-y-4">
        <Field label={t(k("studioName"))} htmlFor="studioName">
          <Input id="studioName" name="studioName" required maxLength={80} placeholder={beauty ? "Uñas de Lu" : "Estudio Ánima"} />
        </Field>
        <Field label={t("yourName")} htmlFor="name">
          <Input id="name" name="name" required maxLength={80} autoComplete="name" />
        </Field>
        <Field label={t("email")} htmlFor="email">
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </Field>
        <Field
          label={t("password")}
          htmlFor="password"
          hint={te("passwordTooShort")}
          error={message}
        >
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </Field>
        <SubmitButton className="w-full" pendingLabel={tc("loading")}>
          {t(k("createStudio"))}
        </SubmitButton>
      </form>
    </div>
  );
}
