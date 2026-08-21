"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { setPasswordAction, type PasswordState } from "./actions";

const MIN_LENGTH = 8;

export function PasswordForm() {
  const t = useTranslations("password");
  const tc = useTranslations("common");
  const [state, submit] = useActionState<PasswordState, FormData>(setPasswordAction, null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  /*
    Checked as they type rather than on submit. This screen stands between
    someone and the app on their first sign-in, holding a password that was
    read out to them — finding out it was too short only after a round trip is
    where people give up and ask the studio to try again.

    Only complain once there is something to complain about: an empty field is
    not yet a mistake.
  */
  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && password !== confirm;
  const ready = password.length >= MIN_LENGTH && password === confirm;

  return (
    <form action={submit} className="space-y-4">
      <Field
        label={t("newPassword")}
        htmlFor="password"
        hint={t("hint")}
        error={tooShort ? t("tooShort") : undefined}
      >
        <PasswordInput
          id="password"
          name="password"
          required
          minLength={MIN_LENGTH}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      <Field
        label={t("confirm")}
        htmlFor="confirm"
        error={mismatch ? t("mismatch") : state?.error ? t(state.error) : undefined}
      >
        <PasswordInput
          id="confirm"
          name="confirm"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </Field>

      {/* Confirmation that it is right, not only that it is wrong. */}
      {ready && <p className="text-xs text-positive">{t("ready")}</p>}

      <SubmitButton className="w-full" pendingLabel={tc("saving")}>
        {t("save")}
      </SubmitButton>
    </form>
  );
}
