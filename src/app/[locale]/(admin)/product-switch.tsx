"use client";

import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { setAdminProductAction } from "./product-actions";
import type { AdminProduct } from "@/lib/admin/product";

const OPTIONS: { value: AdminProduct; label: string }[] = [
  { value: "temppo", label: "Reservas" },
  { value: "beauty", label: "Beauty" },
];

/** Which product the console is showing. Same pages, filtered. */
export function ProductSwitch({ current }: { current: AdminProduct }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div
      role="radiogroup"
      aria-label="Producto"
      className={`inline-flex rounded-[var(--radius-pill)] bg-white/10 p-1 text-sm ${pending ? "opacity-60" : ""}`}
    >
      {OPTIONS.map((o) => {
        const active = o.value === current;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={pending}
            onClick={() =>
              !active &&
              start(async () => {
                await setAdminProductAction(o.value);
                router.refresh();
              })
            }
            className={`rounded-[var(--radius-pill)] px-3.5 py-1 font-medium transition-colors ${
              active
                ? o.value === "beauty"
                  ? "bg-[#DE8BA3] text-ink"
                  : "bg-[#E07A5F] text-ink"
                : "text-white/60 hover:text-white"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
