"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Field, Input, Select } from "@/components/ui/field";
import { Button, buttonClass } from "@/components/ui/button";
import { LOGO_ACCEPT, shrinkLogo } from "@/lib/logo/shrink";
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
  beauty = false,
}: {
  /** An appointment business: "tu negocio", and receipts from clientas. */
  beauty?: boolean;
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

  // The logo travels with the rest of the form, appended on submit.
  const [logo, setLogo] = useState<Blob | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [preview, setPreview] = useState(values.logoUrl);
  const [logoError, setLogoError] = useState<string>();
  const serverLogoError =
    state?.error === "logoInvalid" || state?.error === "logoTooBig" ? t(state.error) : undefined;

  // Saved: what is on screen is now what is stored, so don't send it twice.
  useEffect(() => {
    if (!state?.ok) return;
    setLogo(null);
    setLogoRemoved(false);
  }, [state]);

  async function pickLogo(file: File | undefined) {
    if (!file) return;
    setLogoError(undefined);
    try {
      const blob = await shrinkLogo(file);
      setLogo(blob);
      setLogoRemoved(false);
      setPreview(URL.createObjectURL(blob));
    } catch {
      setLogoError(t("logoInvalid"));
    }
  }

  function removeLogo() {
    setLogo(null);
    setLogoRemoved(true);
    setPreview("");
    setLogoError(undefined);
  }

  function save(formData: FormData) {
    if (logo) formData.set("logo", logo, "logo.png");
    else if (logoRemoved) formData.set("logoRemove", "1");
    submit(formData);
  }

  return (
    <form action={save} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t(beauty ? "studioNameBeauty" : "studioName")}>
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
        <Field label={t(beauty ? "whatsappNumberBeauty" : "whatsappNumber")} hint={t(beauty ? "whatsappHintBeauty" : "whatsappHint")}>
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
          <Field label={t("logo")} hint={t("logoHint")} error={logoError ?? serverLogoError ?? message}>
            <div className="flex items-center gap-3">
              <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line-strong bg-surface">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="" className="size-full object-contain" />
                ) : (
                  <span className="text-xs text-muted">—</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <label className={buttonClass("secondary", "sm", "cursor-pointer")}>
                  {preview ? t("logoChange") : t("logoUpload")}
                  <input
                    type="file"
                    accept={LOGO_ACCEPT}
                    className="sr-only"
                    onChange={(event) => {
                      void pickLogo(event.target.files?.[0]);
                      // Picking the same file again should still count.
                      event.target.value = "";
                    }}
                  />
                </label>
                {preview && (
                  <Button type="button" variant="ghost" size="sm" onClick={removeLogo}>
                    {t("logoRemove")}
                  </Button>
                )}
              </div>
            </div>
          </Field>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel={tc("saving")}>{tc("save")}</SubmitButton>
        {state?.ok && <span className="text-sm text-positive">{tc("saved")}</span>}
      </div>
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
    monthlyChangesAllowed: number;
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
        <Field label={t("monthlyChanges")} hint={t("monthlyChangesHint")}>
          <Input
            name="monthlyChangesAllowed"
            type="number"
            min={0}
            max={31}
            defaultValue={values.monthlyChangesAllowed}
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
      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel={tc("saving")}>{tc("save")}</SubmitButton>
        {state?.ok && <span className="text-sm text-positive">{tc("saved")}</span>}
      </div>
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

/**
 * `beauty`: an appointment business has professionals, not teachers paid per
 * class, so the role reads "Profesional" and there is no pay to set.
 */
export function InviteForm({ currency, beauty = false }: { currency: string; beauty?: boolean }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const ts = useTranslations("students");
  const [state, submit] = useActionState<ActionState, FormData>(inviteMemberAction, null);
  const [role, setRole] = useState("INSTRUCTOR");
  const message = useMessage(state);

  /*
    The password is handed over here rather than only emailed. An invite that
    depends on mail arriving is an invite that quietly fails, and the studio has
    no way to tell the difference between "not delivered" and "not created".
  */
  if (state?.ok && state.tempPassword) {
    return (
      <div className="space-y-4">
        <div className="rounded-[var(--radius-lg)] border border-line bg-sunken px-4 py-4 text-center">
          <p className="text-xs uppercase tracking-wide text-muted">{ts("tempPasswordTitle")}</p>
          <p className="mt-1.5 font-display text-3xl font-bold tracking-wider text-accent">
            {state.tempPassword}
          </p>
          <p className="mt-2 text-xs text-muted">{t(beauty ? "invitePasswordHintBeauty" : "invitePasswordHint")}</p>
        </div>

        <p className="rounded-md bg-caution-soft px-3 py-2 text-xs text-caution">
          {ts("tempPasswordOnce")}
        </p>
      </div>
    );
  }

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
            <option value="INSTRUCTOR">{t(beauty ? "roleProfessional" : "roleINSTRUCTOR")}</option>
            <option value="ADMIN">{t("roleADMIN")}</option>
          </Select>
        </Field>
        {role === "INSTRUCTOR" && !beauty && (
          <Field label={`${t("payPerClass")} (${currency})`} error={message}>
            <Input name="payPerClass" inputMode="decimal" placeholder="900" />
          </Field>
        )}
      </div>
      {(beauty || role !== "INSTRUCTOR") && message && <p className="text-xs text-critical">{message}</p>}
      <SubmitButton pendingLabel={tc("saving")}>{t("newMember")}</SubmitButton>
    </form>
  );
}
