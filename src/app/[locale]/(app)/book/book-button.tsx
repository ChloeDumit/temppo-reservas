"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useFormStatus } from "react-dom";
import {
  bookAction,
  cancelOwnBookingAction,
  joinWaitlistAction,
  leaveWaitlistAction,
  type BookState,
} from "./actions";

const ERROR_KEYS: Record<string, string> = {
  CLASS_FULL: "classFull",
  ALREADY_BOOKED: "alreadyBooked",
  NO_CREDITS: "noCredits",
  TOO_EARLY: "tooEarly",
  IN_PAST: "inPast",
  BLOCKED: "blocked",
  CLASS_CANCELLED: "inPast",
};

/** Must live *inside* the form — useFormStatus reads the nearest parent form. */
function Pending({
  label,
  variant = "primary",
}: {
  label: string;
  variant?: "primary" | "ghost";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size="sm" disabled={pending}>
      {label}
    </Button>
  );
}

export function BookButton({ classInstanceId }: { classInstanceId: string }) {
  const t = useTranslations("booking");
  const [state, submit] = useActionState<BookState, FormData>(bookAction, null);

  return (
    <form action={submit} className="text-right">
      <input type="hidden" name="classInstanceId" value={classInstanceId} />
      <Pending label={t("book")} />
      {state?.error && (
        <p className="mt-1 max-w-44 text-xs text-critical">
          {ERROR_KEYS[state.error] ? t(ERROR_KEYS[state.error]) : t("classFull")}
        </p>
      )}
    </form>
  );
}

export function CancelBookingButton({
  bookingId,
  lateWarningHours,
  isLate,
}: {
  bookingId: string;
  lateWarningHours: number;
  isLate: boolean;
}) {
  const t = useTranslations("booking");
  const [state, submit] = useActionState<BookState, FormData>(cancelOwnBookingAction, null);

  return (
    <form action={submit} className="text-right">
      <input type="hidden" name="bookingId" value={bookingId} />
      <Pending label={t("cancel")} variant="ghost" />
      {isLate && (
        <p className="mt-1 max-w-44 text-xs text-caution">
          {t("cancelWarning", { hours: lateWarningHours })}
        </p>
      )}
      {state?.error && <p className="mt-1 text-xs text-critical">{t("inPast")}</p>}
    </form>
  );
}

export function JoinWaitlistButton({ classInstanceId }: { classInstanceId: string }) {
  const t = useTranslations("booking");
  const [, submit] = useActionState<BookState, FormData>(joinWaitlistAction, null);

  return (
    <form action={submit}>
      <input type="hidden" name="classInstanceId" value={classInstanceId} />
      <Pending label={t("joinWaitlist")} variant="ghost" />
    </form>
  );
}

export function LeaveWaitlistButton({
  classInstanceId,
  position,
}: {
  classInstanceId: string;
  position: number;
}) {
  const t = useTranslations("booking");
  const [, submit] = useActionState<BookState, FormData>(leaveWaitlistAction, null);

  return (
    <form action={submit} className="flex items-center gap-2">
      <input type="hidden" name="classInstanceId" value={classInstanceId} />
      <span className="text-xs text-muted">{t("onWaitlist", { position })}</span>
      <Pending label={t("leaveWaitlist")} variant="ghost" />
    </form>
  );
}
