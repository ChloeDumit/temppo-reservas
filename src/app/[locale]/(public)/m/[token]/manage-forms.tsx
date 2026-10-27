"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Spinner } from "@/components/ui/spinner";
import { getSlotsAction, type DayOption } from "../../b/[slug]/actions";
import { cancelByTokenAction, payDepositAction, rescheduleByTokenAction, type ManageState } from "./actions";

export function CancelForm({ token, late }: { token: string; late: boolean }) {
  const t = useTranslations("manage");
  const [confirming, setConfirming] = useState(false);
  const [state, submit] = useActionState<ManageState, FormData>(cancelByTokenAction, null);

  if (!confirming) {
    return (
      <Button type="button" variant="ghost" onClick={() => setConfirming(true)} className="w-full">
        {t("cancel")}
      </Button>
    );
  }
  return (
    <form action={submit} className="space-y-3 rounded-[var(--radius-md)] bg-sunken p-3">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-ink">{late ? t("cancelLateWarning") : t("cancelSure")}</p>
      {state?.error && <p className="text-sm text-critical">{t("errGeneric")}</p>}
      <div className="flex gap-2">
        <SubmitButton variant="danger" pendingLabel={t("cancelling")}>
          {t("yesCancel")}
        </SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
          {t("keep")}
        </Button>
      </div>
    </form>
  );
}

export function PayForm({
  token,
  methods,
  hasEmail,
}: {
  token: string;
  methods: { mp: boolean; transfer: boolean };
  hasEmail: boolean;
}) {
  const t = useTranslations("manage");
  const [state, submit] = useActionState<ManageState, FormData>(payDepositAction, null);
  return (
    <div className="space-y-2">
      {methods.mp && (
        <form action={submit} className="space-y-2">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="method" value="mp" />
          {!hasEmail && (
            <Field label={t("emailForMp")}>
              <Input name="email" type="email" required autoComplete="email" />
            </Field>
          )}
          <SubmitButton className="w-full" pendingLabel={t("opening")}>
            {t("payMp")}
          </SubmitButton>
        </form>
      )}
      {methods.transfer && (
        <form action={submit}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="method" value="transfer" />
          <SubmitButton variant="secondary" className="w-full" pendingLabel={t("opening")}>
            {t("payTransfer")}
          </SubmitButton>
        </form>
      )}
      {state?.error && (
        <p className="text-sm text-critical">{state.error === "emailForMp" ? t("emailForMp") : t("errGeneric")}</p>
      )}
    </div>
  );
}

/** Pick another time with the same professional, from what the page offers. */
export function RescheduleForm({
  token,
  slug,
  serviceId,
  staffId,
  addOnIds,
  timeZone,
  today,
}: {
  token: string;
  slug: string;
  serviceId: string;
  staffId: string;
  addOnIds: string[];
  timeZone: string;
  today: string;
}) {
  const t = useTranslations("manage");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<DayOption[] | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A time is picked first and confirmed second: one stray tap must not move her booking.
  const [picked, setPicked] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const timeFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }),
    [locale, timeZone],
  );
  const dayFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", timeZone: "UTC" }),
    [locale],
  );

  useEffect(() => {
    if (!open || days) return;
    start(async () => {
      const result = await getSlotsAction({ slug, serviceId, addOnIds, staffId, fromDate: today, days: 21 });
      setDays(result);
      setDate(result.find((d) => d.slots.length)?.date ?? null);
    });
  }, [open, days, slug, serviceId, addOnIds, staffId, today]);

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} className="w-full">
        {t("reschedule")}
      </Button>
    );
  }

  const day = days?.find((d) => d.date === date);

  return (
    <div className="space-y-3 rounded-[var(--radius-md)] bg-sunken p-3">
      <p className="text-sm font-medium text-ink">{t("pickNewTime")}</p>
      {!days || pending ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : days.every((d) => !d.slots.length) ? (
        <p className="text-sm text-muted">{t("noTimes")}</p>
      ) : (
        <>
          <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
            {days
              .filter((d) => d.slots.length)
              .map((d) => {
                const [y, m, dd] = d.date.split("-").map(Number);
                return (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => setDate(d.date)}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1.5 text-sm",
                      d.date === date ? "border-accent bg-accent text-white" : "border-line bg-surface text-ink",
                    )}
                  >
                    {dayFmt.format(new Date(Date.UTC(y, m - 1, dd, 12)))}
                  </button>
                );
              })}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {day?.slots.map((s) => (
              <button
                key={s.start}
                type="button"
                disabled={pending}
                onClick={() => {
                  setPicked(s.start);
                  setError(null);
                }}
                className={cn(
                  "rounded-[var(--radius-md)] border py-2 text-sm font-medium tabular-nums",
                  picked === s.start ? "border-accent bg-accent text-white" : "border-line bg-surface text-ink hover:border-accent",
                )}
              >
                {timeFmt.format(new Date(s.start))}
              </button>
            ))}
          </div>
        </>
      )}
      {picked && (
        <Button
          type="button"
          className="w-full"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await rescheduleByTokenAction({ token, startsAt: picked });
              if (result?.ok) {
                setOpen(false);
                setPicked(null);
                router.refresh();
              } else {
                setError(result?.error === "TOO_LATE" ? t("tooLateToMove") : t("errSlotTaken"));
                setPicked(null);
                setDays(null);
              }
            })
          }
        >
          {t("confirmMove", {
            time: new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(new Date(picked)),
          })}
        </Button>
      )}
      {error && <p className="text-sm text-critical">{error}</p>}
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
        {t("keep")}
      </Button>
    </div>
  );
}
