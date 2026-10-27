"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { cancelMyAppointmentAction } from "./actions";

/** Cancel in two taps: one to ask, one to mean it. */
export function CancelMyAppointment({ id, label }: { id: string; label: string }) {
  const t = useTranslations("manage");
  const [sure, setSure] = useState(false);
  if (!sure) {
    return (
      <Button type="button" size="sm" variant="ghost" onClick={() => setSure(true)}>
        {label}
      </Button>
    );
  }
  return (
    <form action={cancelMyAppointmentAction} className="flex gap-1">
      <input type="hidden" name="id" value={id} />
      <SubmitButton size="sm" variant="danger" pendingLabel={t("cancelling")}>
        {t("yesCancel")}
      </SubmitButton>
      <Button type="button" size="sm" variant="ghost" onClick={() => setSure(false)}>
        {t("keep")}
      </Button>
    </form>
  );
}
