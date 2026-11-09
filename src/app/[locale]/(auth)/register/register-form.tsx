"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { registerAction, type AuthState } from "../actions";

const KINDS = ["CLASSES", "VENUES", "APPOINTMENTS"] as const;

/**
 * `beauty` swaps the studio vocabulary for a beauty business's.
 *
 * `defaultKind` is what the landing they arrived from was selling — a club
 * coming off the courts page should not have to say so twice.
 */
export function RegisterForm({
  beauty = false,
  defaultKind = "CLASSES",
}: {
  beauty?: boolean;
  defaultKind?: (typeof KINDS)[number];
}) {
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
        {/*
          The beauty brand is its own product at its own domain; asking a
          nail salon whether it rents courts would be noise. Everyone
          arriving at TEMPPO Reservas picks, because the same page sells
          classes and courts.
        */}
        {!beauty && (
          <fieldset>
            <legend className="mb-1 block text-sm font-medium text-ink">
              {t("manageLabel")}
            </legend>
            <p className="mb-2 text-xs text-muted">{t("manageHint")}</p>
            <div className="space-y-2">
              {KINDS.map((kind) => (
                <label
                  key={kind}
                  className="flex cursor-pointer gap-3 rounded-[var(--radius-md)] border border-line-strong p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
                >
                  <input
                    type="radio"
                    name="vertical"
                    value={kind}
                    defaultChecked={kind === defaultKind}
                    className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">
                      {t(`kind${kind === "CLASSES" ? "Classes" : kind === "VENUES" ? "Venues" : "Appointments"}`)}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                      {t(`kind${kind === "CLASSES" ? "Classes" : kind === "VENUES" ? "Venues" : "Appointments"}Hint`)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">{t("linkIncluded")}</p>
          </fieldset>
        )}

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
