"use client";

import { useActionState, type ReactNode } from "react";
import type { PlanState } from "./actions";

/** A Mi plan button that says how it went right under it, without leaving the page. */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (prev: PlanState, formData: FormData) => Promise<PlanState>;
  children: ReactNode;
  className?: string;
}) {
  const [state, submit] = useActionState<PlanState, FormData>(action, null);
  return (
    <form action={submit} className={className}>
      {children}
      {state?.message && <p className={`mt-2 text-sm ${state.ok ? "text-positive" : "text-critical"}`}>{state.message}</p>}
    </form>
  );
}
