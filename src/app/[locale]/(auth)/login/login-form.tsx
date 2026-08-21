"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { signInAction, magicLinkAction, type AuthState } from "../actions";

export function LoginForm({ next, linkExpired }: { next?: string; linkExpired?: boolean }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const te = useTranslations("errors");

  /*
    Two ways in, not three. Email-and-password and cédula-and-PIN are now the
    same form — the server works out which handle it was given — so the only
    real choice left is "I know my password" versus "email me a link".
  */
  const [magic, setMagic] = useState(false);

  const [signInState, submitSignIn] = useActionState<AuthState, FormData>(signInAction, null);
  const [magicState, submitMagic] = useActionState<AuthState, FormData>(magicLinkAction, null);

  const translateError = (key?: string) => {
    if (!key) return undefined;
    // Field-level messages live under errors.*, auth outcomes under auth.*
    return key === "invalidEmail" || key === "passwordTooShort" || key === "generic"
      ? te(key)
      : t(key);
  };

  if (magicState?.sent) {
    return (
      <div className="card px-5 py-6 text-center">
        <h1 className="text-xl">{t("checkEmail")}</h1>
        <p className="mt-2 text-sm text-muted">{t("magicLinkSent")}</p>
        <p className="mt-4 text-xs text-muted">{t("magicLinkDevNotice")}</p>
      </div>
    );
  }

  return (
    <div className="card px-5 py-6">
      <h1 className="text-xl">{t("loginTitle")}</h1>
      <p className="mt-1 text-sm text-muted">{t("loginSubtitle")}</p>

      {linkExpired && (
        <p className="mt-4 rounded-md bg-caution-soft px-3 py-2 text-sm text-caution">
          {t("magicLinkExpired")}
        </p>
      )}

      {magic ? (
        <form action={submitMagic} className="mt-5 space-y-4">
          <Field label={t("email")} htmlFor="magic-email" error={translateError(magicState?.error)}>
            <Input
              id="magic-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="hola@estudio.com"
            />
          </Field>
          <SubmitButton className="w-full" pendingLabel={tc("loading")}>
            {t("magicLink")}
          </SubmitButton>
        </form>
      ) : (
        <form action={submitSignIn} className="mt-5 space-y-4">
          {next && <input type="hidden" name="next" value={next} />}

          <Field label={t("identifier")} htmlFor="identifier" hint={t("identifierHint")}>
            <Input
              id="identifier"
              name="identifier"
              // Not type="email": a cédula is equally valid here, and the
              // browser would refuse to submit one.
              type="text"
              inputMode="email"
              autoCapitalize="none"
              autoComplete="username"
              required
              maxLength={160}
              placeholder="hola@estudio.com"
            />
          </Field>

          <Field label={t("secret")} htmlFor="secret" error={translateError(signInState?.error)}>
            <PasswordInput
              id="secret"
              name="secret"
              autoComplete="current-password"
              required
              maxLength={200}
            />
          </Field>

          <SubmitButton className="w-full" pendingLabel={tc("loading")}>
            {t("signIn")}
          </SubmitButton>
        </form>
      )}

      <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-muted">
        <span className="h-px flex-1 bg-line" />
        {t("orDivider")}
        <span className="h-px flex-1 bg-line" />
      </div>

      <button
        type="button"
        onClick={() => setMagic((current) => !current)}
        className="block w-full text-sm text-accent underline underline-offset-4 hover:text-accent-hover"
      >
        {magic ? t("signIn") : t("magicLink")}
      </button>
    </div>
  );
}
