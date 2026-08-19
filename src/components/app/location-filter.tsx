"use client";

import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";

/** Submits on change so the filter takes effect without an extra tap. */
export function LocationFilter({
  locations,
  selected,
  week,
  allLabel,
  label,
}: {
  locations: { id: string; name: string }[];
  selected?: string;
  week?: string;
  allLabel: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <select
      name="location"
      aria-label={label}
      defaultValue={selected ?? ""}
      disabled={pending}
      onChange={(event) => {
        const params = new URLSearchParams();
        if (week) params.set("week", week);
        if (event.target.value) params.set("location", event.target.value);
        const query = params.toString();
        startTransition(() => {
          router.push(`/schedule${query ? `?${query}` : ""}`);
        });
      }}
      className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm disabled:opacity-60"
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
