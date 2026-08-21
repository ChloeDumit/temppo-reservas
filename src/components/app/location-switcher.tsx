"use client";

import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { selectLocationAction } from "@/app/[locale]/(app)/location-actions";

/**
 * Switches which sucursal the whole app is showing.
 *
 * Hidden entirely for a studio with a single sucursal — most of them — so the
 * chrome only appears once there is actually a choice to make.
 */
export function LocationSwitcher({
  locations,
  selected,
  allLabel,
  label,
  className,
}: {
  locations: { id: string; name: string }[];
  selected: string | null;
  allLabel: string;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (locations.length < 2) return null;

  return (
    <select
      aria-label={label}
      defaultValue={selected ?? ""}
      disabled={pending}
      onChange={(event) => {
        const next = event.target.value;
        startTransition(async () => {
          await selectLocationAction(next);
          router.refresh();
        });
      }}
      className={`min-w-0 rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm disabled:opacity-60 ${className ?? ""}`}
    >
      <option value="">{allLabel}</option>
      {locations.map((location) => (
        <option key={location.id} value={location.id}>
          {location.name}
        </option>
      ))}
    </select>
  );
}
