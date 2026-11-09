"use client";

import { useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/app/icon";
import { slotsAction, rentAction, type PublicDay } from "./actions";

export type FlowSpace = {
  id: string;
  name: string;
  kind: string | null;
  durationsMin: number[];
  fromCents: number;
};

type Step = "what" | "when" | "who" | "done";

export function RentalFlow({
  slug,
  spaces,
  currency,
  locale,
  copy,
}: {
  slug: string;
  spaces: FlowSpace[];
  currency: string;
  locale: string;
  /** Every string the flow shows, resolved on the server. */
  copy: Record<string, string>;
}) {
  /*
    A club is usually one kind of thing with several identical courts, so the
    first question is what you want to play and for how long — not which court,
    which almost nobody has an opinion about. "Cualquiera" is the default, and
    picking a specific one is an option rather than a step.
  */
  const kinds = [...new Set(spaces.map((s) => s.kind).filter(Boolean))] as string[];
  const [kind, setKind] = useState<string | null>(kinds[0] ?? null);

  const inKind = spaces.filter((s) => !kind || s.kind === kind);
  const durations = [...new Set(inKind.flatMap((s) => s.durationsMin))].sort((a, b) => a - b);

  const [durationMin, setDurationMin] = useState<number>(durations[0] ?? 60);
  const [spaceId, setSpaceId] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("what");
  const [days, setDays] = useState<PublicDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateIndex, setDateIndex] = useState(0);

  const [chosen, setChosen] = useState<{ start: string; label: string; priceCents: number } | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    manageUrl: string;
    spaceName: string;
    priceCents: number;
    depositCents: number;
    pending: boolean;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  // A length the chosen kind does not offer would show no times at all.
  useEffect(() => {
    if (!durations.includes(durationMin)) setDurationMin(durations[0] ?? 60);
    setSpaceId(null);
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step !== "when") return;
    let live = true;
    setLoading(true);
    slotsAction({ slug, durationMin, spaceId, kind })
      .then((result) => {
        if (!live) return;
        setDays(result);
        // Open on the first day that actually has something free.
        const first = result.findIndex((d) => d.slots.length > 0);
        setDateIndex(first < 0 ? 0 : first);
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [step, slug, durationMin, spaceId, kind]);

  const money = (cents: number) => formatMoney(cents, currency, locale);
  const dayLabel = (date: string) => {
    const [y, m, d] = date.split("-").map(Number);
    return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
      .format(new Date(Date.UTC(y, m - 1, d)));
  };

  if (done) {
    return (
      <section className="rounded-[var(--radius-lg)] bg-surface p-6 text-center shadow-[var(--shadow-soft)]">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-positive-soft text-positive">
          <Icon name="check" className="size-6" />
        </span>
        <h2 className="mt-4 text-xl">{done.pending ? copy.heldTitle : copy.doneTitle}</h2>
        <p className="mt-2 text-sm text-ink-soft">
          {done.spaceName} · {chosen?.label} · {money(done.priceCents)}
        </p>
        {/*
          A held court is not a booked one, and saying "confirmada" over a
          court that lapses in fifteen minutes is the kind of lie a club pays
          for at the counter.
        */}
        {done.pending && (
          <p className="mt-3 rounded-[var(--radius-md)] bg-caution-soft px-3 py-2 text-sm text-caution">
            {copy.payToHold.replace("{amount}", money(done.depositCents))}
          </p>
        )}
        <a
          href={done.manageUrl}
          className={
            done.pending
              ? "pressable touch-target mt-5 inline-flex items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-white"
              : "mt-5 inline-block text-sm font-medium text-accent underline-offset-4 hover:underline"
          }
        >
          {done.pending ? copy.payNow : copy.manageLink}
        </a>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {step === "what" && (
        <div className="space-y-5 rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-soft)]">
          {kinds.length > 1 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted">{copy.kindLabel}</p>
              <div className="flex flex-wrap gap-2">
                {kinds.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={cn(
                      "touch-target rounded-[var(--radius-pill)] border px-4 text-sm font-medium",
                      k === kind ? "border-accent bg-accent text-white" : "border-line-strong text-ink-soft",
                    )}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted">{copy.durationLabel}</p>
            <div className="flex flex-wrap gap-2">
              {durations.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDurationMin(d)}
                  className={cn(
                    "touch-target rounded-[var(--radius-pill)] border px-4 text-sm font-medium tabular-nums",
                    d === durationMin ? "border-accent bg-accent text-white" : "border-line-strong text-ink-soft",
                  )}
                >
                  {d} min
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted">{copy.spaceLabel}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSpaceId(null)}
                className={cn(
                  "touch-target rounded-[var(--radius-pill)] border px-4 text-sm font-medium",
                  spaceId === null ? "border-accent bg-accent text-white" : "border-line-strong text-ink-soft",
                )}
              >
                {copy.anySpace}
              </button>
              {inKind
                .filter((s) => s.durationsMin.includes(durationMin))
                .map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSpaceId(s.id)}
                    className={cn(
                      "touch-target rounded-[var(--radius-pill)] border px-4 text-sm font-medium",
                      spaceId === s.id ? "border-accent bg-accent text-white" : "border-line-strong text-ink-soft",
                    )}
                  >
                    {s.name}
                  </button>
                ))}
            </div>
          </div>

          <Button className="w-full" onClick={() => setStep("when")}>
            {copy.seeTimes}
          </Button>
        </div>
      )}

      {step === "when" && (
        <div className="rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-soft)]">
          <button
            type="button"
            onClick={() => setStep("what")}
            className="mb-4 inline-flex items-center gap-1 text-sm text-muted"
          >
            <Icon name="chevronLeft" className="size-4" />
            {copy.back}
          </button>

          {loading ? (
            <p className="py-8 text-center text-sm text-muted">{copy.loading}</p>
          ) : days.every((d) => d.slots.length === 0) ? (
            <p className="py-8 text-center text-sm text-muted">{copy.noTimes}</p>
          ) : (
            <>
              {/* Days across, times below: the shape of every court booking
                  app, and the one people already know how to read. */}
              <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
                {days.map((day, i) => (
                  <button
                    key={day.date}
                    type="button"
                    disabled={day.slots.length === 0}
                    onClick={() => setDateIndex(i)}
                    className={cn(
                      "shrink-0 rounded-[var(--radius-md)] border px-3 py-2 text-xs font-medium",
                      i === dateIndex
                        ? "border-accent bg-accent text-white"
                        : day.slots.length === 0
                          ? "border-line text-muted/50"
                          : "border-line-strong text-ink-soft",
                    )}
                  >
                    {dayLabel(day.date)}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {(days[dateIndex]?.slots ?? []).map((slot) => (
                  <button
                    key={slot.start}
                    type="button"
                    onClick={() => {
                      setChosen(slot);
                      setStep("who");
                    }}
                    className="rounded-[var(--radius-md)] border border-line-strong px-2 py-2.5 text-center"
                  >
                    <span className="block text-sm font-medium tabular-nums text-ink">{slot.label}</span>
                    <span className="block text-[11px] tabular-nums text-muted">{money(slot.priceCents)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {step === "who" && chosen && (
        <div className="space-y-4 rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-soft)]">
          <button
            type="button"
            onClick={() => setStep("when")}
            className="inline-flex items-center gap-1 text-sm text-muted"
          >
            <Icon name="chevronLeft" className="size-4" />
            {copy.back}
          </button>

          <p className="text-sm text-ink-soft">
            {dayLabel(days[dateIndex]?.date ?? "")} · {chosen.label} · {durationMin} min ·{" "}
            <span className="font-medium text-ink">{money(chosen.priceCents)}</span>
          </p>

          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-widest text-muted">{copy.name}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-line-strong bg-paper px-3 py-2.5 text-[16px]"
              autoComplete="name"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-widest text-muted">{copy.phone}</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              inputMode="tel"
              className="w-full rounded-[var(--radius-md)] border border-line-strong bg-paper px-3 py-2.5 text-[16px]"
              autoComplete="tel"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-widest text-muted">{copy.notes}</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-[var(--radius-md)] border border-line-strong bg-paper px-3 py-2.5 text-[16px]"
            />
          </label>

          {error && <p className="text-sm text-critical">{error}</p>}

          <Button
            className="w-full"
            disabled={pending || name.trim().length === 0 || phone.trim().length < 6}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await rentAction({
                  slug,
                  startsAt: chosen.start,
                  durationMin,
                  spaceId,
                  kind,
                  name,
                  phone,
                  notes,
                });
                if (result.ok) setDone(result);
                // Someone else took it while this page was open: send them
                // back to a freshly loaded grid rather than a dead error.
                else if (result.error === "unavailable") {
                  setError(copy.taken);
                  setStep("when");
                } else setError(copy.generic);
              })
            }
          >
            {pending ? copy.booking : copy.confirm}
          </Button>
        </div>
      )}
    </section>
  );
}
