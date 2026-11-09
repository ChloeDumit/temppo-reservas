"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { payRentalAction, cancelRentalByTokenAction, type RentalManageState } from "./rental-actions";

/**
 * How the seña gets paid.
 *
 * Mercado Pago needs an email to send the receipt to, which the club may not
 * have — a court is booked with a name and a phone. So the field appears only
 * on the online path, and a transfer asks for nothing.
 */
export function PayRentalForm({
  token,
  methods,
  surchargeLabel,
  copy,
}: {
  token: string;
  methods: { mp: boolean; transfer: boolean };
  /** The grossed-up total when the club passes the fee on. Null otherwise. */
  surchargeLabel: string | null;
  copy: Record<string, string>;
}) {
  const [state, action] = useActionState<RentalManageState, FormData>(payRentalAction, null);
  const [method, setMethod] = useState<"mp" | "transfer">(methods.mp ? "mp" : "transfer");

  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="method" value={method} />

      {methods.mp && methods.transfer && (
        <div className="flex gap-2">
          {(["mp", "transfer"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMethod(option)}
              className={
                option === method
                  ? "flex-1 rounded-[var(--radius-md)] border border-accent bg-accent px-3 py-2 text-sm font-medium text-white"
                  : "flex-1 rounded-[var(--radius-md)] border border-line-strong px-3 py-2 text-sm text-ink-soft"
              }
            >
              {option === "mp" ? copy.payOnline : copy.payTransfer}
            </button>
          ))}
        </div>
      )}

      {method === "mp" && (
        <Field label={copy.emailLabel}>
          <Input name="email" type="email" required autoComplete="email" />
        </Field>
      )}

      {state?.error && <p className="text-sm text-critical">{copy.generic}</p>}

      <SubmitButton className="w-full">
        {method === "mp" ? (surchargeLabel ?? copy.payOnline) : copy.payTransfer}
      </SubmitButton>
    </form>
  );
}

/** Giving the court back. Two taps, because it cannot be undone. */
export function CancelRentalForm({
  token,
  disabled,
  copy,
}: {
  token: string;
  disabled: boolean;
  copy: Record<string, string>;
}) {
  const [state, action] = useActionState<RentalManageState, FormData>(cancelRentalByTokenAction, null);
  const [asked, setAsked] = useState(false);

  if (disabled) {
    return <p className="text-center text-sm text-muted">{copy.tooLate}</p>;
  }

  if (!asked) {
    return (
      <Button variant="secondary" className="w-full" onClick={() => setAsked(true)}>
        {copy.cancel}
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="token" value={token} />
      {state?.error && <p className="text-sm text-critical">{copy.generic}</p>}
      <SubmitButton variant="danger" className="w-full">
        {copy.confirm}
      </SubmitButton>
      <Button variant="ghost" className="w-full" onClick={() => setAsked(false)}>
        {copy.cancel}
      </Button>
    </form>
  );
}
