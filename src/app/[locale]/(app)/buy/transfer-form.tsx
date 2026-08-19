"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { buttonClass } from "@/components/ui/button";
import { Icon } from "@/components/app/icon";
import { whatsappLink } from "@/lib/payment-code";
import { submitTransferAction, type BuyState } from "./actions";

export function TransferForm({
  packId,
  studioWhatsapp,
  studentName,
  currency,
  locale,
}: {
  packId: string;
  studioWhatsapp: string | null;
  studentName: string;
  currency: string;
  locale: string;
}) {
  const t = useTranslations("buy");
  const tt = useTranslations("transfer");
  const tc = useTranslations("common");
  const te = useTranslations("errors");

  // Deliberately stays open on success: the code below is the whole point.
  const [state, submit] = useActionState<BuyState, FormData>(submitTransferAction, null);

  if (state?.ok && state.shortCode) {
    const amount = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format((state.amountCents ?? 0) / 100);

    const message = tt("waMessage", {
      code: state.shortCode,
      pack: state.packName ?? "",
      amount,
      name: studentName,
    });

    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-positive-soft px-4 py-3 text-sm text-positive">
          {t("submitted")}
        </div>

        <div className="rounded-lg border border-line bg-sunken px-4 py-4 text-center">
          <p className="text-xs uppercase tracking-wide text-muted">{tt("codeTitle")}</p>
          <p className="mt-1 font-display text-3xl font-bold tracking-wider text-accent">
            {state.shortCode}
          </p>
          <p className="mt-2 text-xs text-muted">{tt("codeHint")}</p>
        </div>

        {studioWhatsapp ? (
          <>
            <a
              href={whatsappLink(studioWhatsapp, message)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass("primary", "md", "w-full")}
            >
              <Icon name="check" className="size-4" />
              {tt("sendWhatsapp")}
            </a>
            <p className="text-center text-xs text-muted">{tt("sendWhatsappHint")}</p>
          </>
        ) : (
          <p className="rounded-md bg-caution-soft px-3 py-2 text-sm text-caution">
            {tt("noWhatsapp")}
          </p>
        )}
      </div>
    );
  }

  const message = state?.error
    ? state.error === "proofUrl"
      ? t("invalidProof")
      : te("generic")
    : undefined;

  return (
    <form action={submit} className="space-y-3">
      <input type="hidden" name="packId" value={packId} />
      <Field label={t("reference")}>
        <Input name="reference" maxLength={160} placeholder="BROU 8842" />
      </Field>
      <Field label={t("proofUrl")} hint={t("proofHint")} error={message}>
        <Input name="proofUrl" type="url" placeholder="https://…" />
      </Field>
      <SubmitButton className="w-full" pendingLabel={tc("saving")}>
        {t("submit")}
      </SubmitButton>
    </form>
  );
}
