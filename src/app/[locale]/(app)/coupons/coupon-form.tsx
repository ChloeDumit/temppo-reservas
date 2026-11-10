"use client";

import { useActionState, useEffect, useState } from "react";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { createCouponAction, type CouponState } from "./actions";

/** «Nuevo cupón»: says how it went right here, and empties itself once created. */
export function CouponForm({ targets, what, today }: { targets: { id: string; name: string }[]; what: string; today: string }) {
  const [state, submit] = useActionState<CouponState, FormData>(createCouponAction, null);
  // A fresh form after each coupon created, so the next one starts empty.
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (state?.ok) setRound((r) => r + 1);
  }, [state]);

  return (
    <form key={round} action={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Código" hint="Lo que escribe tu clienta, por ejemplo VERANO20.">
          <Input name="code" required minLength={3} maxLength={20} autoCapitalize="characters" autoComplete="off" className="uppercase" placeholder="VERANO20" />
        </Field>
        <Field label="Descuento (%)">
          <Input name="percentOff" type="number" required min={1} max={100} placeholder="20" />
        </Field>
        <Field label="Desde (opcional)">
          <Input name="from" type="date" min={today} />
        </Field>
        <Field label="Hasta (opcional)" hint="Vale hasta el final de ese día.">
          <Input name="until" type="date" min={today} />
        </Field>
      </div>
      {targets.length > 0 && (
        <fieldset className="space-y-2 rounded-[var(--radius-md)] bg-sunken p-3">
          <legend className="mb-1 text-sm font-medium text-ink-soft">Vale para</legend>
          <p className="text-xs text-muted">Si no marcás ninguno, vale para todos los {what}.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {targets.map((t) => (
              <label key={t.id} className="flex items-center gap-2.5 text-sm text-ink">
                <input type="checkbox" name="targets" value={t.id} className="size-4 accent-[var(--color-accent)]" />
                {t.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {state?.message && <p className={`text-sm ${state.ok ? "text-positive" : "text-critical"}`}>{state.message}</p>}
      <SubmitButton pendingLabel="Creando…">Crear cupón</SubmitButton>
    </form>
  );
}
