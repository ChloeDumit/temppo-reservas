"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { useSheetClose } from "@/components/app/sheet-form";
import { saveTemplateAction, type ActionState } from "./actions";

export type TemplateValues = {
  id?: string;
  name: string;
  description: string;
  colorHex: string;
  capacity: number;
  durationMins: number;
  weekdays: number[];
  startTime: string;
  startDate: string;
  endDate: string;
  instructorId: string;
  locationId: string;
};

const PALETTE = ["#C0563C", "#3F6C8F", "#6B7A4B", "#8A5B8E", "#B08234", "#4A4E69"];

export function TemplateForm({
  values,
  instructors,
  locations,
  weekdayLabels,
}: {
  values: TemplateValues;
  instructors: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  weekdayLabels: string[];
}) {
  const t = useTranslations("classes");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const ts = useTranslations("schedule");

  const closeSheet = useSheetClose();
  const [state, submit] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await saveTemplateAction(prev, formData);
    if (result?.ok) closeSheet();
    return result;
  }, null);

  const errorText = state?.error
    ? state.error === "selectWeekday"
      ? t("selectWeekday")
      : state.error === "capacityTooLow"
        ? te("capacityTooLow")
        : te("generic")
    : undefined;

  return (
    <form action={submit} className="space-y-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}

      <Field label={t("name")} htmlFor={`name-${values.id ?? "new"}`}>
        <Input
          id={`name-${values.id ?? "new"}`}
          name="name"
          required
          maxLength={80}
          defaultValue={values.name}
          placeholder="Pilates Reformer"
        />
      </Field>

      <Field label={t("description")}>
        <Textarea name="description" maxLength={500} defaultValue={values.description} />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink-soft">{t("weekdays")}</legend>
        <div className="flex flex-wrap gap-1.5">
          {weekdayLabels.map((label, index) => (
            <label
              key={index}
              className="cursor-pointer select-none rounded-md border border-line-strong px-3 py-2 text-sm text-ink-soft transition-colors has-checked:border-accent has-checked:bg-accent-soft has-checked:text-accent-ink"
            >
              <input
                type="checkbox"
                name="weekdays"
                value={index}
                defaultChecked={values.weekdays.includes(index)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("startTime")}>
          <Input name="startTime" type="time" required defaultValue={values.startTime} />
        </Field>
        <Field label={t("duration")}>
          <Input
            name="durationMins"
            type="number"
            min={5}
            max={600}
            required
            defaultValue={values.durationMins}
          />
        </Field>
        <Field label={t("capacity")}>
          <Input
            name="capacity"
            type="number"
            min={1}
            max={500}
            required
            defaultValue={values.capacity}
          />
        </Field>
        <Field label={t("color")}>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {PALETTE.map((color) => (
              <label key={color} className="cursor-pointer">
                <input
                  type="radio"
                  name="colorHex"
                  value={color}
                  defaultChecked={values.colorHex.toLowerCase() === color.toLowerCase()}
                  className="peer sr-only"
                />
                <span
                  className="block size-7 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-ink"
                  style={{ backgroundColor: color }}
                />
              </label>
            ))}
          </div>
        </Field>
        <Field label={t("startDate")}>
          <Input name="startDate" type="date" required defaultValue={values.startDate} />
        </Field>
        <Field label={t("endDate")} hint={t("noEndDate")}>
          <Input name="endDate" type="date" defaultValue={values.endDate} />
        </Field>
        <Field label={ts("instructor")}>
          <Select name="instructorId" defaultValue={values.instructorId}>
            <option value="">{ts("unassigned")}</option>
            {instructors.map((instructor) => (
              <option key={instructor.id} value={instructor.id}>
                {instructor.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={ts("location")} error={errorText}>
          <Select name="locationId" defaultValue={values.locationId}>
            <option value="">{tc("none")}</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <SubmitButton pendingLabel={tc("saving")}>{tc("save")}</SubmitButton>
    </form>
  );
}
