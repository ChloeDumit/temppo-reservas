"use client";

import { useActionState } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useSheetClose } from "@/components/app/sheet-form";
import { saveSpaceAction, saveBandAction, type ActionState } from "./actions";

export type SpaceValues = {
  id?: string;
  name: string;
  kind: string;
  capacity: string;
  pricePerHour: string;
  durations: string;
  bufferAfterMin: number;
  weekdays: number[];
  openFrom: string;
  openTo: string;
};

function errorText(state: ActionState, copy: Record<string, string>) {
  if (!state?.error) return null;
  return copy[state.error] ?? copy.generic;
}

export function SpaceForm({
  values,
  weekdayLabels,
  copy,
}: {
  values: SpaceValues;
  weekdayLabels: string[];
  copy: Record<string, string>;
}) {
  const [state, action] = useActionState(saveSpaceAction, null);
  const close = useSheetClose();

  if (state?.ok) close();

  return (
    <form action={action} className="space-y-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}

      <Field label={copy.name}>
        <Input name="name" defaultValue={values.name} required maxLength={80} />
      </Field>

      <Field label={copy.kind} hint={copy.kindHint}>
        <Input name="kind" defaultValue={values.kind} maxLength={40} placeholder={copy.kindPlaceholder} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={copy.pricePerHour}>
          <Input name="pricePerHour" defaultValue={values.pricePerHour} inputMode="decimal" required />
        </Field>
        <Field label={copy.capacity} hint={copy.capacityHint}>
          <Input name="capacity" defaultValue={values.capacity} inputMode="numeric" />
        </Field>
      </div>

      <Field label={copy.durations} hint={copy.durationsHint}>
        <Input name="durations" defaultValue={values.durations} required />
      </Field>

      <Field label={copy.buffer} hint={copy.bufferHint}>
        <Input
          name="bufferAfterMin"
          type="number"
          min={0}
          max={240}
          defaultValue={values.bufferAfterMin}
        />
      </Field>

      {/* Monday first, matching every other day picker in the app. */}
      <Field label={copy.days}>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5, 6, 0].map((day) => (
            <label
              key={day}
              className="cursor-pointer select-none rounded-[var(--radius-pill)] border border-line-strong px-3 py-1.5 text-sm text-ink-soft has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-white"
            >
              <input
                type="checkbox"
                name="weekday"
                value={day}
                defaultChecked={values.weekdays.includes(day)}
                className="sr-only"
              />
              {weekdayLabels[day]}
            </label>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={copy.opensAt}>
          <Input name="openFrom" type="time" defaultValue={values.openFrom} required />
        </Field>
        <Field label={copy.closesAt}>
          <Input name="openTo" type="time" defaultValue={values.openTo} required />
        </Field>
      </div>

      {state?.error && <p className="text-sm text-critical">{errorText(state, copy)}</p>}

      <SubmitButton className="w-full">{copy.save}</SubmitButton>
    </form>
  );
}

/** A peak rate on one space. Added one at a time; removed from the list. */
export function BandForm({
  spaceId,
  weekdayLabels,
  copy,
}: {
  spaceId: string;
  weekdayLabels: string[];
  copy: Record<string, string>;
}) {
  const [state, action] = useActionState(saveBandAction, null);
  const close = useSheetClose();

  if (state?.ok) close();

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="spaceId" value={spaceId} />

      <Field label={copy.bandLabel} hint={copy.bandLabelHint}>
        <Input name="label" maxLength={40} placeholder={copy.bandPlaceholder} />
      </Field>

      <Field label={copy.days}>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5, 6, 0].map((day) => (
            <label
              key={day}
              className="cursor-pointer select-none rounded-[var(--radius-pill)] border border-line-strong px-3 py-1.5 text-sm text-ink-soft has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-white"
            >
              <input type="checkbox" name="bandWeekday" value={day} className="sr-only" />
              {weekdayLabels[day]}
            </label>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={copy.from}>
          <Input name="from" type="time" defaultValue="18:00" required />
        </Field>
        <Field label={copy.to}>
          <Input name="to" type="time" defaultValue="23:00" required />
        </Field>
      </div>

      <Field label={copy.pricePerHour}>
        <Input name="pricePerHour" inputMode="decimal" required />
      </Field>

      {state?.error && <p className="text-sm text-critical">{errorText(state, copy)}</p>}

      <SubmitButton className="w-full">{copy.save}</SubmitButton>
    </form>
  );
}
