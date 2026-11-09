"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { Icon } from "@/components/app/icon";
import { slotsAction, rentAction, type PublicDay } from "./actions";

export type FlowSpace = {
  id: string;
  name: string;
  kind: string | null;
  durationsMin: number[];
  fromCents: number;
  /** What this court asks up front, at its base rate. 0 when it asks nothing. */
  depositHintCents: number;
};

type StepId = "kind" | "duration" | "day" | "time" | "who";

/**
 * Booking a court, one question at a time.
 *
 * It used to open with three questions stacked in one card — what, how long,
 * which court — and no sense of how much was left. Worse, the seña only
 * appeared after the booking was made, so you committed and then found out
 * you owed money to keep it. Now each screen asks one thing, the steps that
 * have only one answer are skipped rather than shown, and the whole booking —
 * seña included — is laid out before anything is confirmed.
 */
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
  copy: Record<string, string>;
}) {
  const kinds = useMemo(
    () => [...new Set(spaces.map((s) => s.kind).filter(Boolean))] as string[],
    [spaces],
  );

  const [kind, setKind] = useState<string | null>(kinds.length === 1 ? kinds[0] : null);
  const inKind = useMemo(() => spaces.filter((s) => !kind || s.kind === kind), [spaces, kind]);
  const durations = useMemo(
    () => [...new Set(inKind.flatMap((s) => s.durationsMin))].sort((a, b) => a - b),
    [inKind],
  );

  const [durationMin, setDurationMin] = useState<number | null>(
    durations.length === 1 ? durations[0] : null,
  );
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [dayIndex, setDayIndex] = useState<number | null>(null);
  const [chosen, setChosen] = useState<{ start: string; label: string; priceCents: number } | null>(
    null,
  );

  const [days, setDays] = useState<PublicDay[]>([]);
  const [loading, setLoading] = useState(false);

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

  /*
    A club with one kind of thing and one length should not be asked about
    either. The steps are what is genuinely still open, so a single-court club
    gets three screens and a multi-sport one gets five — rather than everyone
    walking past questions that have only one answer.
  */
  const steps = useMemo<StepId[]>(
    () => [
      ...(kinds.length > 1 ? (["kind"] as const) : []),
      ...(durations.length > 1 ? (["duration"] as const) : []),
      "day",
      "time",
      "who",
    ],
    [kinds.length, durations.length],
  );

  const [step, setStep] = useState<StepId>(steps[0]);
  const index = Math.max(0, steps.indexOf(step));

  // A change of kind can leave a single length, or none that still applies.
  useEffect(() => {
    if (durations.length === 1) setDurationMin(durations[0]);
    else setDurationMin((current) => (current !== null && durations.includes(current) ? current : null));
    setSpaceId(null);
  }, [durations]);

  // Times are fetched once per length and shared by the day and time steps.
  useEffect(() => {
    if (durationMin === null) return;
    let live = true;
    setLoading(true);
    slotsAction({ slug, durationMin, spaceId, kind })
      .then((result) => {
        if (!live) return;
        setDays(result);
        setDayIndex((current) => {
          if (current !== null && result[current]?.slots.length) return current;
          const first = result.findIndex((d) => d.slots.length > 0);
          return first < 0 ? null : first;
        });
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [slug, durationMin, spaceId, kind]);

  const money = (cents: number) => formatMoney(cents, currency, locale);

  const dayName = (date: string, long = false) => {
    const [y, m, d] = date.split("-").map(Number);
    const at = new Date(Date.UTC(y, m - 1, d));
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (date === todayKey) return copy.today;
    return new Intl.DateTimeFormat(locale, {
      weekday: long ? "long" : "short",
      day: "numeric",
      month: long ? "long" : "short",
      timeZone: "UTC",
    }).format(at);
  };

  const go = (next: StepId) => {
    setError(null);
    setStep(next);
  };
  const forward = () => go(steps[Math.min(index + 1, steps.length - 1)]);
  const back = () => go(steps[Math.max(index - 1, 0)]);

  const space = spaces.find((s) => s.id === spaceId) ?? null;
  const cheapest = inKind.length ? Math.min(...inKind.map((s) => s.fromCents)) : 0;

  /*
    Whether the club will ask for something up front. Which court it lands on
    is not known until the booking is made, so this says that a seña applies
    rather than quoting a figure it might have to take back.
  */
  const wantsDeposit = useMemo(() => {
    const pool = space ? [space] : inKind;
    return pool.some((s) => s.depositHintCents > 0);
  }, [space, inKind]);

  if (done) {
    return (
      <section className="rounded-[var(--radius-lg)] bg-surface p-6 text-center shadow-[var(--shadow-soft)]">
        <span
          className={cn(
            "mx-auto flex size-12 items-center justify-center rounded-full",
            done.pending ? "bg-caution-soft text-caution" : "bg-positive-soft text-positive",
          )}
        >
          <Icon name={done.pending ? "clock" : "check"} className="size-6" />
        </span>
        <h2 className="mt-4 text-xl">{done.pending ? copy.heldTitle : copy.doneTitle}</h2>
        <p className="mt-2 text-sm text-ink-soft">
          {done.spaceName} · {chosen?.label} · {money(done.priceCents)}
        </p>
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

  const question = {
    kind: copy.askKind,
    duration: copy.askDuration,
    day: copy.askDay,
    time: copy.askTime,
    who: copy.askWho,
  }[step];

  /** What has been decided, as chips that take you back to change it. */
  const trail: { id: StepId; label: string }[] = [
    ...(kind && steps.includes("kind") && index > steps.indexOf("kind")
      ? [{ id: "kind" as const, label: kind }]
      : []),
    ...(durationMin !== null && steps.includes("duration") && index > steps.indexOf("duration")
      ? [{ id: "duration" as const, label: `${durationMin} min` }]
      : []),
    ...(dayIndex !== null && index > steps.indexOf("day") && days[dayIndex]
      ? [{ id: "day" as const, label: dayName(days[dayIndex].date) }]
      : []),
    ...(chosen && index > steps.indexOf("time")
      ? [{ id: "time" as const, label: chosen.label }]
      : []),
  ];

  const rowClass =
    "pressable-row flex w-full items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line-strong px-4 py-3.5 text-left";

  return (
    <section className="rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-soft)]">
      <div className="mb-4 flex items-center gap-3">
        {index > 0 ? (
          <button
            type="button"
            onClick={back}
            aria-label={copy.back}
            className="pressable -ml-1 rounded-md p-1 text-muted"
          >
            <Icon name="chevronLeft" className="size-5" />
          </button>
        ) : (
          <span />
        )}
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-sunken" aria-hidden>
          <span
            className="block h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${((index + 1) / steps.length) * 100}%` }}
          />
        </span>
        <span className="text-[11px] tabular-nums text-muted">
          {index + 1}/{steps.length}
        </span>
      </div>

      <h2 className="text-lg text-ink">{question}</h2>

      {trail.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {trail.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => go(item.id)}
              className="rounded-[var(--radius-pill)] bg-sunken px-2.5 py-1 text-xs text-ink-soft"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-5">
        {step === "kind" && (
          <ul className="space-y-2">
            {kinds.map((k) => {
              const from = Math.min(...spaces.filter((s) => s.kind === k).map((s) => s.fromCents));
              return (
                <li key={k}>
                  <button
                    type="button"
                    onClick={() => {
                      setKind(k);
                      forward();
                    }}
                    className={rowClass}
                  >
                    <span className="font-medium text-ink">{k}</span>
                    <span className="shrink-0 text-sm tabular-nums text-muted">
                      {copy.from} {money(from)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {step === "duration" && (
          <ul className="space-y-2">
            {durations.map((d) => (
              <li key={d}>
                <button
                  type="button"
                  onClick={() => {
                    setDurationMin(d);
                    forward();
                  }}
                  className={rowClass}
                >
                  <span className="font-medium text-ink">
                    {d >= 60 ? `${Math.floor(d / 60)} h${d % 60 ? ` ${d % 60} min` : ""}` : `${d} min`}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-muted">
                    {copy.from} {money(Math.round((cheapest * d) / 60))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {step === "day" &&
          (loading ? (
            <p className="py-6 text-center text-sm text-muted">{copy.loading}</p>
          ) : days.every((d) => d.slots.length === 0) ? (
            <p className="py-6 text-center text-sm text-muted">{copy.noTimes}</p>
          ) : (
            <ul className="space-y-2">
              {days
                .map((day, i) => ({ day, i }))
                .filter(({ day }) => day.slots.length > 0)
                .map(({ day, i }) => (
                  <li key={day.date}>
                    <button
                      type="button"
                      onClick={() => {
                        setDayIndex(i);
                        setChosen(null);
                        forward();
                      }}
                      className={rowClass}
                    >
                      <span className="font-medium first-letter:uppercase text-ink">{dayName(day.date, true)}</span>
                      <span className="shrink-0 text-sm tabular-nums text-muted">
                        {copy.freeCount.replace("{count}", String(day.slots.length))}
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          ))}

        {step === "time" && dayIndex !== null && (
          <>
            {/* Prices differ by hour, so each button carries its own. */}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {(days[dayIndex]?.slots ?? []).map((slot) => (
                <button
                  key={slot.start}
                  type="button"
                  onClick={() => {
                    setChosen(slot);
                    forward();
                  }}
                  className="rounded-[var(--radius-md)] border border-line-strong px-2 py-2.5 text-center"
                >
                  <span className="block text-sm font-medium tabular-nums text-ink">{slot.label}</span>
                  <span className="block text-[11px] tabular-nums text-muted">
                    {money(slot.priceCents)}
                  </span>
                </button>
              ))}
            </div>

            {/*
              Choosing a particular court is an option, not a question: most
              people do not care which one, and asking everyone made it look
              as though they ought to.
            */}
            {inKind.length > 1 && (
              <details className="mt-4 rounded-[var(--radius-md)] bg-sunken/60 px-3 py-2">
                <summary className="cursor-pointer list-none text-sm text-ink-soft marker:content-none">
                  {space ? copy.courtChosen.replace("{name}", space.name) : copy.pickCourt}
                </summary>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSpaceId(null)}
                    className={cn(
                      "rounded-[var(--radius-pill)] border px-3 py-1.5 text-sm",
                      spaceId === null
                        ? "border-accent bg-accent text-white"
                        : "border-line-strong text-ink-soft",
                    )}
                  >
                    {copy.anySpace}
                  </button>
                  {inKind
                    .filter((s) => durationMin === null || s.durationsMin.includes(durationMin))
                    .map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSpaceId(s.id)}
                        className={cn(
                          "rounded-[var(--radius-pill)] border px-3 py-1.5 text-sm",
                          spaceId === s.id
                            ? "border-accent bg-accent text-white"
                            : "border-line-strong text-ink-soft",
                        )}
                      >
                        {s.name}
                      </button>
                    ))}
                </div>
              </details>
            )}
          </>
        )}

        {step === "who" && chosen && dayIndex !== null && (
          <div className="space-y-4">
            {/* The whole booking, before anything is committed to. */}
            <dl className="space-y-1.5 rounded-[var(--radius-md)] bg-sunken/60 p-3.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{copy.summaryWhen}</dt>
                <dd className="text-right first-letter:uppercase text-ink">
                  {dayName(days[dayIndex].date, true)} · {chosen.label}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{copy.summaryWhat}</dt>
                <dd className="text-right text-ink">
                  {space ? space.name : (kind ?? copy.anySpace)} · {durationMin} min
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-line pt-1.5">
                <dt className="text-muted">{copy.summaryTotal}</dt>
                <dd className="text-right font-medium tabular-nums text-ink">
                  {money(chosen.priceCents)}
                </dd>
              </div>
            </dl>

            {wantsDeposit && (
              <p className="rounded-[var(--radius-md)] bg-caution-soft px-3 py-2 text-xs text-caution">
                {copy.depositWarning}
              </p>
            )}

            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-widest text-muted">
                {copy.name}
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-[var(--radius-md)] border border-line-strong bg-paper px-3 py-2.5 text-[16px]"
                autoComplete="name"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-widest text-muted">
                {copy.phone}
              </span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                inputMode="tel"
                className="w-full rounded-[var(--radius-md)] border border-line-strong bg-paper px-3 py-2.5 text-[16px]"
                autoComplete="tel"
              />
              <span className="mt-1 block text-xs text-muted">{copy.phoneHint}</span>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-widest text-muted">
                {copy.notes}
              </span>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-[var(--radius-md)] border border-line-strong bg-paper px-3 py-2.5 text-[16px]"
              />
            </label>

            {error && <p className="text-sm text-critical">{error}</p>}

            <button
              type="button"
              disabled={pending || name.trim().length === 0 || phone.trim().length < 6}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const result = await rentAction({
                    slug,
                    startsAt: chosen.start,
                    durationMin: durationMin!,
                    spaceId,
                    kind,
                    name,
                    phone,
                    notes,
                  });
                  if (result.ok) setDone(result);
                  else if (result.error === "unavailable") {
                    // Someone took it while this page was open: back to the
                    // grid, which reloads, rather than a dead error.
                    setError(copy.taken);
                    setChosen(null);
                    go("time");
                  } else setError(copy.generic);
                })
              }
              className="pressable touch-target w-full rounded-md bg-accent px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? copy.booking : wantsDeposit ? copy.holdAndPay : copy.confirm}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
