"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  loginAction,
  magicLinkAction,
  documentLoginAction,
  type AuthState,
} from "../actions";

export function LoginForm({ next, linkExpired }: { next?: string; linkExpired?: boolean }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const [mode, setMode] = useState<"password" | "magic" | "document">("password");

  const [passwordState, submitPassword] = useActionState<AuthState, FormData>(loginAction, null);
  const [magicState, submitMagic] = useActionState<AuthState, FormData>(magicLinkAction, null);
  const [documentState, submitDocument] = useActionState<AuthState, FormData>(
    documentLoginAction,
    null,
  );

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

      {mode === "password" ? (
        <form action={submitPassword} className="mt-5 space-y-4">
          {next && <input type="hidden" name="next" value={next} />}
          <Field label={t("email")} htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="hola@estudio.com"
            />
          </Field>
          <Field label={t("password")} htmlFor="password" error={translateError(passwordState?.error)}>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <SubmitButton className="w-full" pendingLabel={tc("loading")}>
            {t("signIn")}
          </SubmitButton>
        </form>
      ) : mode === "document" ? (
        <form action={submitDocument} className="mt-5 space-y-4">
          {next && <input type="hidden" name="next" value={next} />}
          <Field label={t("documentId")} htmlFor="documentId">
            <Input
              id="documentId"
              name="documentId"
              inputMode="numeric"
              autoComplete="username"
              required
              maxLength={30}
              placeholder="1.234.567-8"
            />
          </Field>
          <Field label={t("pin")} htmlFor="pin" error={translateError(documentState?.error)}>
            <Input
              id="pin"
              name="pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              required
              maxLength={8}
            />
          </Field>
          <SubmitButton className="w-full" pendingLabel={tc("loading")}>
            {t("signIn")}
          </SubmitButton>
        </form>
      ) : (
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
      )}

      <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-muted">
        <span className="h-px flex-1 bg-line" />
        {t("orDivider")}
        <span className="h-px flex-1 bg-line" />
      </div>

      <div className="space-y-2 text-center">
        {mode !== "password" && (
          <button
            type="button"
            onClick={() => setMode("password")}
            className="block w-full text-sm text-accent underline underline-offset-4 hover:text-accent-hover"
          >
            {t("signInWithPassword")}
          </button>
        )}
        {mode !== "magic" && (
          <button
            type="button"
            onClick={() => setMode("magic")}
            className="block w-full text-sm text-accent underline underline-offset-4 hover:text-accent-hover"
          >
            {t("magicLink")}
          </button>
        )}
        {mode !== "document" && (
          <button
            type="button"
            onClick={() => setMode("document")}
            className="block w-full text-sm text-accent underline underline-offset-4 hover:text-accent-hover"
          >
            {t("documentLogin")}
          </button>
        )}
      </div>
    </div>
  );
}
