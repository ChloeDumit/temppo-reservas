"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useSheetClose } from "@/components/app/sheet-form";
import { createClientAction, type ClientState } from "./actions";

/** A new client, added by hand. Opens her file once she exists. */
export function NewClientForm() {
  const t = useTranslations("clients");
  const router = useRouter();
  const closeSheet = useSheetClose();
  const [state, submit] = useActionState<ClientState, FormData>(createClientAction, null);

  useEffect(() => {
    if (state?.ok && state.id) {
      closeSheet();
      router.push(`/clients/${state.id}`);
    }
  }, [state, closeSheet, router]);

  return (
    <form action={submit} className="space-y-4">
      <Field label={t("name")}>
        <Input name="name" required minLength={2} maxLength={80} autoComplete="off" />
      </Field>
      <Field label={t("phone")} error={state?.error === "phone" ? t("errPhone") : undefined}>
        <Input name="phone" required type="tel" inputMode="tel" maxLength={30} placeholder="099 123 456" />
      </Field>
      <Field label={`${t("email")} (${t("optional")})`} error={state?.error === "email" ? t("errEmail") : undefined}>
        <Input name="email" type="email" />
      </Field>
      <Field label={t("allergies")} hint={t("allergiesHint")}>
        <Input name="allergies" maxLength={500} placeholder={t("allergiesPlaceholder")} />
      </Field>
      <Field label={t("notes")} hint={t("notesHint")}>
        <Textarea name="notes" maxLength={2000} placeholder={t("notesPlaceholder")} />
      </Field>
      {state?.error === "exists" && state.id && (
        <p className="text-sm text-caution">
          {t("exists")}{" "}
          <Link href={`/clients/${state.id}`} className="font-medium underline" onClick={closeSheet}>
            {t("openFile")}
          </Link>
        </p>
      )}
      {state?.error === "generic" && <p className="text-sm text-critical">{t("errGeneric")}</p>}
      <SubmitButton pendingLabel={t("adding")}>{t("add")}</SubmitButton>
    </form>
  );
}
