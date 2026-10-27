"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { depositFor } from "@/lib/appointments/deposit";
import { shiftDateKey } from "@/lib/appointments/slots";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Spinner } from "@/components/ui/spinner";
import { bookPublicAction, getSlotsAction, type BookState, type DayOption } from "./actions";

export type FlowService = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  durationMin: number;
  priceCents: number;
  depositType: "NONE" | "PERCENT" | "FIXED";
  depositValue: number;
  staffIds: string[];
  addOns: { id: string; name: string; durationMin: number; priceCents: number }[];
};

type Step = "service" | "extras" | "staff" | "time" | "details";

const WINDOW_DAYS = 14;

function duration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

/**
 * The client's side of booking, one decision per screen: what, extras, who,
 * when, then her details. Thumb-sized choices, nothing to type until the end,
 * and every earlier choice one tap away in the summary.
 */
export function BookingFlow({
  slug,
  services,
  staff,
  currency,
  timeZone,
  today,
  cancellationCutoffHours,
  depositRefundable,
  methods,
}: {
  slug: string;
  services: FlowService[];
  staff: { id: string; name: string }[];
  currency: string;
  timeZone: string;
  today: string;
  cancellationCutoffHours: number;
  /** In time, the deposit is returned; otherwise it stays as credit. */
  depositRefundable: boolean;
  methods: { mp: boolean; transfer: boolean };
}) {
  const t = useTranslations("bookPublic");
  const locale = useLocale();
  const money = (cents: number) => formatMoney(cents, currency, locale);

  const [step, setStep] = useState<Step>("service");
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [addOnIds, setAddOnIds] = useState<string[]>([]);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(today);
  const [days, setDays] = useState<DayOption[] | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [pay, setPay] = useState<"mp" | "transfer">(methods.mp ? "mp" : "transfer");
  const [state, submit] = useActionState<BookState, FormData>(bookPublicAction, null);

  const service = services.find((s) => s.id === serviceId) ?? null;
  const chosenAddOns = service?.addOns.filter((a) => addOnIds.includes(a.id)) ?? [];
  const total = (service?.priceCents ?? 0) + chosenAddOns.reduce((s, a) => s + a.priceCents, 0);
  const length = (service?.durationMin ?? 0) + chosenAddOns.reduce((s, a) => s + a.durationMin, 0);
  const deposit = service && (methods.mp || methods.transfer) ? depositFor(service.depositType, service.depositValue, total) : 0;
  const offeredStaff = service ? staff.filter((s) => service.staffIds.includes(s.id)) : [];

  const timeFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }),
    [locale, timeZone],
  );
  const dayFmt = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }), [locale]);
  const longFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone }),
    [locale, timeZone],
  );
  const keyDate = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12));
  };

  // Fetch open times whenever what is being booked, or the fortnight, changes.
  useEffect(() => {
    if (step !== "time" || !serviceId) return;
    startLoading(async () => {
      const result = await getSlotsAction({ slug, serviceId, addOnIds, staffId, fromDate, days: WINDOW_DAYS });
      setDays(result);
      const first = result.find((d) => d.slots.length);
      setDate((current) => (current && result.some((d) => d.date === current && d.slots.length) ? current : (first?.date ?? null)));
    });
  }, [step, slug, serviceId, addOnIds, staffId, fromDate]);

  const pickService = (id: string) => {
    const s = services.find((x) => x.id === id)!;
    setServiceId(id);
    setAddOnIds([]);
    setStart(null);
    setDays(null);
    const eligible = staff.filter((x) => s.staffIds.includes(x.id));
    setStaffId(eligible.length === 1 ? eligible[0].id : null);
    setStep(s.addOns.length ? "extras" : eligible.length > 1 ? "staff" : "time");
  };

  const afterExtras = () => setStep(offeredStaff.length > 1 ? "staff" : "time");

  const byCategory = services.reduce<Record<string, FlowService[]>>((acc, s) => {
    const key = s.category ?? "";
    (acc[key] ??= []).push(s);
    return acc;
  }, {});

  const day = days?.find((d) => d.date === date);
  const chosenSlot = day?.slots.find((s) => s.start === start);
  const staffName = (id: string | null) => staff.find((s) => s.id === id)?.name;

  const errorText = state?.error
    ? ({
        SLOT_TAKEN: t("errSlotTaken"),
        UNAVAILABLE: t("errSlotTaken"),
        IN_PAST: t("errSlotTaken"),
        NOT_FOUND: t("errSlotTaken"),
        BLOCKED: t("errBlocked"),
        phone: t("errPhone"),
        email: t("errEmail"),
        name: t("errName"),
        emailForMp: t("errEmailForMp"),
        tooManyHolds: t("errTooManyHolds"),
      } as Record<string, string>)[state.error] ?? t("errGeneric")
    : null;

  // Back to the times when the one chosen was taken meanwhile — saying so
  // there, since the details step with its message is no longer on screen.
  const [timeNote, setTimeNote] = useState<string | null>(null);
  const [handled, setHandled] = useState<typeof state>(null);
  useEffect(() => {
    if (state && state !== handled && ["SLOT_TAKEN", "UNAVAILABLE", "IN_PAST", "NOT_FOUND"].includes(state.error ?? "")) {
      setHandled(state);
      setTimeNote(t("errSlotTaken"));
      setStart(null);
      setDays(null);
      setStep("time");
    }
  }, [state, handled, t]);
  // An error already acted on is not shown again on the next attempt.
  const detailsError = state === handled ? null : errorText;

  const back = (to: Step) => (
    <button type="button" onClick={() => setStep(to)} className="text-sm font-medium text-accent">
      ← {t("back")}
    </button>
  );

  const card = "rounded-[var(--radius-lg)] border border-line bg-surface shadow-[var(--shadow-soft)]";
  const choice =
    "pressable flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-sunken";

  return (
    <div className="space-y-4">
      {/* What has been chosen so far, each part a way back. */}
      {service && step !== "service" && (
        <div className={cn(card, "space-y-1 px-4 py-3 text-sm")}>
          <button type="button" onClick={() => setStep("service")} className="flex w-full justify-between gap-3 text-left">
            <span className="font-medium text-ink">
              {service.name}
              {chosenAddOns.length > 0 && <span className="font-normal text-muted"> + {chosenAddOns.map((a) => a.name).join(", ")}</span>}
            </span>
            <span className="shrink-0 tabular-nums text-ink-soft">{money(total)}</span>
          </button>
          <p className="text-muted">
            {duration(length)}
            {(step === "time" || step === "details") && offeredStaff.length > 1 && (
              <>
                {" · "}
                <button type="button" onClick={() => setStep("staff")} className="underline-offset-4 hover:underline">
                  {staffId ? staffName(staffId) : t("anyone")}
                </button>
              </>
            )}
            {step === "details" && chosenSlot && (
              <>
                {" · "}
                <button type="button" onClick={() => setStep("time")} className="underline-offset-4 hover:underline">
                  {longFmt.format(new Date(chosenSlot.start))}, {timeFmt.format(new Date(chosenSlot.start))}
                </button>
              </>
            )}
          </p>
        </div>
      )}

      {step === "service" && (
        <div className="space-y-5">
          <h2 className="px-1 text-lg">{t("whatService")}</h2>
          {Object.entries(byCategory).map(([category, items]) => (
            <section key={category || "none"}>
              {category && <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">{category}</h3>}
              <ul className={cn(card, "divide-y divide-line overflow-hidden")}>
                {items.map((s) => (
                  <li key={s.id}>
                    <button type="button" className={choice} onClick={() => pickService(s.id)}>
                      <span className="min-w-0">
                        <span className="block font-medium text-ink">{s.name}</span>
                        <span className="block text-sm text-muted">
                          {duration(s.durationMin)}
                          {s.depositType !== "NONE" && (methods.mp || methods.transfer) && (
                            <> · {t("depositOf", { amount: money(depositFor(s.depositType, s.depositValue, s.priceCents)) })}</>
                          )}
                        </span>
                        {s.description && <span className="mt-0.5 block text-sm text-ink-soft">{s.description}</span>}
                      </span>
                      <span className="shrink-0 font-medium tabular-nums text-ink">{money(s.priceCents)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {step === "extras" && service && (
        <div className="space-y-3">
          {back("service")}
          <h2 className="px-1 text-lg">{t("addExtras")}</h2>
          <ul className={cn(card, "divide-y divide-line overflow-hidden")}>
            {service.addOns.map((a) => {
              const on = addOnIds.includes(a.id);
              return (
                <li key={a.id}>
                  <label className={cn(choice, "cursor-pointer")}>
                    <span className="flex min-w-0 items-center gap-3">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setAddOnIds((ids) => (on ? ids.filter((x) => x !== a.id) : [...ids, a.id]))}
                        className="size-5 accent-[var(--color-accent)]"
                      />
                      <span>
                        <span className="block font-medium text-ink">{a.name}</span>
                        {a.durationMin > 0 && <span className="block text-sm text-muted">+{duration(a.durationMin)}</span>}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-ink-soft">+{money(a.priceCents)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={afterExtras}
            className="pressable w-full rounded-full bg-accent px-5 py-3 font-medium text-white shadow-[var(--shadow-soft)]"
          >
            {addOnIds.length ? t("continue") : t("noExtras")}
          </button>
        </div>
      )}

      {step === "staff" && service && (
        <div className="space-y-3">
          {back(service.addOns.length ? "extras" : "service")}
          <h2 className="px-1 text-lg">{t("withWhom")}</h2>
          <ul className={cn(card, "divide-y divide-line overflow-hidden")}>
            {[{ id: null as string | null, name: t("anyone") }, ...offeredStaff].map((s) => (
              <li key={s.id ?? "any"}>
                <button
                  type="button"
                  className={choice}
                  onClick={() => {
                    setStaffId(s.id);
                    setStart(null);
                    setDays(null);
                    setStep("time");
                  }}
                >
                  <span className="font-medium text-ink">{s.name}</span>
                  {s.id === null && <span className="text-sm text-muted">{t("anyoneHint")}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {step === "time" && service && (
        <div className="space-y-3">
          {back(offeredStaff.length > 1 ? "staff" : service.addOns.length ? "extras" : "service")}
          <div className="flex items-center justify-between px-1">
            <h2 className="text-lg">{t("when")}</h2>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={fromDate <= today || loading}
                onClick={() => setFromDate(shiftDateKey(fromDate, -WINDOW_DAYS))}
                className="rounded-full px-3 py-1 text-sm text-accent disabled:text-muted"
                aria-label={t("earlier")}
              >
                ‹
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => setFromDate(shiftDateKey(fromDate, WINDOW_DAYS))}
                className="rounded-full px-3 py-1 text-sm text-accent disabled:text-muted"
                aria-label={t("later")}
              >
                ›
              </button>
            </div>
          </div>

          {timeNote && <p className="rounded-[var(--radius-md)] bg-critical-soft px-3 py-2 text-sm text-critical">{timeNote}</p>}
          {days === null || loading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : days.every((d) => d.slots.length === 0) ? (
            <p className={cn(card, "p-6 text-center text-sm text-muted")}>{t("noTimes")}</p>
          ) : (
            <>
              {/* Days as a strip the thumb can swipe; empty days stay visible but quiet. */}
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                {days.map((d) => {
                  const dt = keyDate(d.date);
                  const empty = d.slots.length === 0;
                  const on = d.date === date;
                  return (
                    <button
                      key={d.date}
                      type="button"
                      disabled={empty}
                      onClick={() => {
                        setDate(d.date);
                        setStart(null);
                      }}
                      className={cn(
                        "flex w-14 shrink-0 flex-col items-center rounded-[var(--radius-md)] border py-2 text-sm transition-colors",
                        on
                          ? "border-accent bg-accent text-white"
                          : empty
                            ? "border-transparent text-muted/60"
                            : "border-line bg-surface text-ink",
                      )}
                    >
                      <span className="text-[11px] uppercase">{dayFmt.format(dt).replace(".", "")}</span>
                      <span className="text-lg font-semibold tabular-nums">{dt.getUTCDate()}</span>
                    </button>
                  );
                })}
              </div>

              {day && (
                <div>
                  <p className="mb-2 px-1 text-sm text-muted">{longFmt.format(keyDate(day.date))}</p>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                    {day.slots.map((s) => (
                      <button
                        key={s.start}
                        type="button"
                        onClick={() => {
                          setStart(s.start);
                          setTimeNote(null);
                          setStep("details");
                        }}
                        className={cn(
                          "pressable rounded-[var(--radius-md)] border py-2.5 text-sm font-medium tabular-nums",
                          s.start === start ? "border-accent bg-accent text-white" : "border-line bg-surface text-ink hover:border-accent",
                        )}
                      >
                        {timeFmt.format(new Date(s.start))}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {step === "details" && service && chosenSlot && (
        <form action={submit} className="space-y-4">
          {back("time")}
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="serviceId" value={service.id} />
          {addOnIds.map((id) => (
            <input key={id} type="hidden" name="addOnIds" value={id} />
          ))}
          {staffId && <input type="hidden" name="staffId" value={staffId} />}
          <input type="hidden" name="startsAt" value={chosenSlot.start} />
          {/* Honeypot, hidden from people. */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

          <h2 className="px-1 text-lg">{t("yourDetails")}</h2>
          <div className={cn(card, "space-y-4 p-4")}>
            <Field label={t("name")}>
              <Input name="name" required minLength={2} maxLength={80} autoComplete="name" />
            </Field>
            <Field label={t("phone")} hint={t("phoneHint")}>
              <Input name="phone" required type="tel" inputMode="tel" autoComplete="tel" placeholder="099 123 456" />
            </Field>
            <Field label={deposit > 0 && pay === "mp" ? t("email") : t("emailOptional")} hint={t("emailHint")}>
              <Input name="email" type="email" autoComplete="email" required={deposit > 0 && pay === "mp"} />
            </Field>
            <Field label={t("notes")}>
              <Textarea name="notes" maxLength={300} placeholder={t("notesPlaceholder")} />
            </Field>
          </div>

          {deposit > 0 && (
            <div className={cn(card, "space-y-3 p-4")}>
              <p className="text-sm text-ink">
                {t(depositRefundable ? "depositExplain" : "depositExplainCredit", { amount: money(deposit), hours: cancellationCutoffHours })}
              </p>
              {methods.mp && methods.transfer && (
                <div className="grid grid-cols-2 gap-2">
                  {(["mp", "transfer"] as const).map((m) => (
                    <label
                      key={m}
                      className={cn(
                        "flex cursor-pointer items-center justify-center rounded-[var(--radius-md)] border px-3 py-2.5 text-sm font-medium",
                        pay === m ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-ink-soft",
                      )}
                    >
                      <input type="radio" name="pay" value={m} checked={pay === m} onChange={() => setPay(m)} className="sr-only" />
                      {m === "mp" ? t("payMp") : t("payTransfer")}
                    </label>
                  ))}
                </div>
              )}
              {!(methods.mp && methods.transfer) && <input type="hidden" name="pay" value={pay} />}
            </div>
          )}

          {detailsError && <p className="text-sm text-critical">{detailsError}</p>}

          <SubmitButton pendingLabel={t("booking")} className="w-full">
            {deposit > 0 ? (pay === "mp" ? t("bookAndPay", { amount: money(deposit) }) : t("bookTransfer")) : t("book")}
          </SubmitButton>
          <p className="px-1 text-center text-xs text-muted">
            {staffId ? t("withPro", { name: staffName(staffId) ?? "" }) : chosenSlot.staffIds.length > 1 ? t("withAnyone") : t("withPro", { name: staffName(chosenSlot.staffIds[0]) ?? "" })}
          </p>
        </form>
      )}
    </div>
  );
}
