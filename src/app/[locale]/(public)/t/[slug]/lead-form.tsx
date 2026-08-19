"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { submitLeadAction, type LeadState } from "./actions";

export function LeadForm({
  slug,
  classes,
  source,
}: {
  slug: string;
  classes: { id: string; label: string }[];
  source?: string;
}) {
  const t = useTranslations("trial");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const [state, submit] = useActionState<LeadState, FormData>(submitLeadAction, null);

  if (state?.ok) {
    return (
      <div className="card px-5 py-8 text-center">
        <h2 className="text-xl">{t("thanksTitle")}</h2>
        <p className="mt-2 text-sm text-muted">{t("thanksBody")}</p>
      </div>
    );
  }

  const message = state?.error
    ? state.error === "invalidEmail"
      ? te("invalidEmail")
      : te("generic")
    : undefined;

  return (
    <form action={submit} className="card space-y-4 px-5 py-6">
      <input type="hidden" name="slug" value={slug} />
      {source && <input type="hidden" name="source" value={source} />}

      {/* Honeypot — hidden from people, tempting to bots. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="hidden"
      />

      <Field label={t("name")}>
        <Input name="name" required maxLength={80} autoComplete="name" />
      </Field>
      <Field label={t("email")} error={message}>
        <Input name="email" type="email" required autoComplete="email" />
      </Field>
      <Field label={t("phone")} hint="+598…">
        <Input name="phone" type="tel" maxLength={30} autoComplete="tel" />
      </Field>

      {classes.length > 0 && (
        <Field label={t("pickClass")}>
          <Select name="classInstanceId" defaultValue="">
            <option value="">{t("anyTime")}</option>
            {classes.map((klass) => (
              <option key={klass.id} value={klass.id}>
                {klass.label}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label={t("message")}>
        <Textarea name="message" maxLength={500} />
      </Field>

      <SubmitButton className="w-full" pendingLabel={tc("saving")}>
        {t("submit")}
      </SubmitButton>
    </form>
  );
}
