"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  cancelSubscriptionAction,
  startSubscriptionAction,
  type BillingState,
} from "./actions";

function useMessage(state: BillingState) {
  const t = useTranslations("billing");
  const te = useTranslations("errors");
  if (!state?.error) return undefined;
  if (state.error === "notConfigured") return t("errorNotConfigured");
  if (state.error === "noEmail") return t("errorNoEmail");
  if (state.error === "providerFailed") return t("errorProvider");
  return te("generic");
}

export function SubscribeButton({
  plan,
  label,
  variant = "primary",
}: {
  plan: string;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const [state, submit] = useActionState<BillingState, FormData>(startSubscriptionAction, null);
  const message = useMessage(state);

  return (
    <form action={submit} className="space-y-2">
      <input type="hidden" name="plan" value={plan} />
      <SubmitButton variant={variant} size="sm" className="w-full">
        {label}
      </SubmitButton>
      {message && <p className="text-xs text-critical">{message}</p>}
    </form>
  );
}

export function CancelSubscriptionForm() {
  const t = useTranslations("billing");
  const [state, submit] = useActionState<BillingState, FormData>(cancelSubscriptionAction, null);
  const message = useMessage(state);

  return (
    <form action={submit} className="space-y-2">
      <SubmitButton variant="danger" size="sm">
        {t("cancel")}
      </SubmitButton>
      <p className="text-xs text-muted">{t("cancelHint")}</p>
      {message && <p className="text-xs text-critical">{message}</p>}
    </form>
  );
}
