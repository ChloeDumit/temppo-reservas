"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  createLocationAction,
  inviteMemberAction,
  updateRulesAction,
  updateStudioAction,
  type ActionState,
} from "./actions";

const TIMEZONES = [
  "America/Montevideo",
  "America/Argentina/Buenos_Aires",
  "America/Santiago",
  "America/Sao_Paulo",
  "America/Bogota",
  "America/Mexico_City",
  "America/Lima",
  "Europe/Madrid",
];

function useMessage(state: ActionState) {
  const te = useTranslations("errors");
  const ta = useTranslations("auth");
  if (!state?.error) return undefined;
  if (state.error === "emailTaken") return ta("emailTaken");
  if (state.error === "invalidEmail") return te("invalidEmail");
  return te("generic");
}

export function StudioForm({
  values,
}: {
  values: {
    name: string;
    timezone: string;
    currency: string;
    locale: string;
    accentColor: string;
    logoUrl: string;
    whatsappNumber: string;
  };
}) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [state, submit] = useActionState<ActionState, FormData>(updateStudioAction, null);
  const [accent, setAccent] = useState(values.accentColor);
  const message = useMessage(state);

  return (
    <form action={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("studioName")}>
          <Input name="name" required maxLength={80} defaultValue={values.name} />
        </Field>
        <Field label={t("timezone")}>
          <Select name="timezone" defaultValue={values.timezone}>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("currency")}>
          <Input name="currency" required maxLength={3} defaultValue={values.currency} />
        </Field>
        <Field label={t("defaultLocale")}>
          <Select name="locale" defaultValue={values.locale}>
            <option value="es">Español</option>
            <option value="en">English</option>
          </Select>
        </Field>
        <Field label={t("whatsappNumber")} hint={t("whatsappHint")}>
          <Input
            name="whatsappNumber"
            type="tel"
            maxLength={25}
            defaultValue={values.whatsappNumber}
            placeholder="+59899123456"
          />
        </Field>
      </div>

      <div className="rounded-lg bg-sunken px-4 py-3">
        <p className="mb-3 text-xs text-ink-soft">{t("brandingFree")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("accentColor")}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={accent}
                onChange={(event) => setAccent(event.target.value)}
                className="h-10 w-14 cursor-pointer rounded-md border border-line-strong bg-surface p-1"
                aria-label={t("accentColor")}
              />
              <Input
                name="accentColor"
                value={accent}
                onChange={(event) => setAccent(event.target.value)}
                maxLength={7}
              />
            </div>
          </Field>
          <Field label={t("logo")} hint={t("logoHint")} error={message}>
            <Input
              name="logoUrl"
              type="url"
              defaultValue={values.logoUrl}
              placeholder="https://…/logo.png"
            />
          </Field>
        </div>
      </div>

      <SubmitButton pendingLabel={tc("saving")}>{tc("save")}</SubmitButton>
    </form>
  );
}

export function RulesForm({
  values,
}: {
  values: {
    cancellationCutoffHours: number;
    reminderHoursBefore: number;
    waitlistClaimWindowMins: number;
    noShowLimit: number;
    bookingOpensDaysAhead: number;
  };
}) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [state, submit] = useActionState<ActionState, FormData>(updateRulesAction, null);
  const message = useMessage(state);

  return (
    <form action={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("cancellationCutoff")} hint={t("cancellationCutoffHint")}>
          <Input
            name="cancellationCutoffHours"
            type="number"
            min={0}
            max={168}
            required
            defaultValue={values.cancellationCutoffHours}
          />
        </Field>
        <Field label={t("bookingOpensDays")}>
          <Input
            name="bookingOpensDaysAhead"
            type="number"
            min={1}
            max={365}
            required
            defaultValue={values.bookingOpensDaysAhead}
          />
        </Field>
        <Field label={t("reminderHours")}>
          <Input
            name="reminderHoursBefore"
            type="number"
            min={1}
            max={168}
            required
            defaultValue={values.reminderHoursBefore}
          />
        </Field>
        <Field label={t("waitlistWindow")}>
          <Input
            name="waitlistClaimWindowMins"
            type="number"
            min={5}
            max={1440}
            required
            defaultValue={values.waitlistClaimWindowMins}
          />
        </Field>
        <Field label={t("noShowLimit")} hint={t("noShowLimitHint")} error={message}>
          <Input
            name="noShowLimit"
            type="number"
            min={0}
            max={50}
            required
            defaultValue={values.noShowLimit}
          />
        </Field>
      </div>
      <SubmitButton pendingLabel={tc("saving")}>{tc("save")}</SubmitButton>
    </form>
  );
}

export function LocationForm() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [state, submit] = useActionState<ActionState, FormData>(createLocationAction, null);
  const message = useMessage(state);

  return (
    <form action={submit} className="flex flex-wrap items-end gap-3">
      <Field label={t("locationName")} className="min-w-40 flex-1">
        <Input name="name" required maxLength={80} />
      </Field>
      <Field label={t("address")} className="min-w-40 flex-1" error={message}>
        <Input name="address" maxLength={200} />
      </Field>
      <SubmitButton variant="secondary" pendingLabel={tc("saving")}>
        {tc("create")}
      </SubmitButton>
    </form>
  );
}

export function InviteForm({ currency }: { currency: string }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const ts = useTranslations("students");
  const [state, submit] = useActionState<ActionState, FormData>(inviteMemberAction, null);
  const [role, setRole] = useState("INSTRUCTOR");
  const message = useMessage(state);

  return (
    <form action={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tc("name")}>
          <Input name="name" required maxLength={80} />
        </Field>
        <Field label={ts("email")}>
          <Input name="email" type="email" required />
        </Field>
        <Field label={t("role")}>
          <Select name="role" value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="INSTRUCTOR">{t("roleINSTRUCTOR")}</option>
            <option value="ADMIN">{t("roleADMIN")}</option>
          </Select>
        </Field>
        {role === "INSTRUCTOR" && (
          <Field label={`${t("payPerClass")} (${currency})`} error={message}>
            <Input name="payPerClass" inputMode="decimal" placeholder="900" />
          </Field>
        )}
      </div>
      <SubmitButton pendingLabel={tc("saving")}>{t("newMember")}</SubmitButton>
    </form>
  );
}
