"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { Icon } from "@/components/app/icon";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cancelRentalAction, markNoShowAction } from "./actions";

export type GridSpace = {
  id: string;
  name: string;
  kind: string | null;
  openMin: number | null;
  closeMin: number | null;
  /** The lengths this court is let for, offered on the counter's form. */
  durationsMin: number[];
};

export type GridRental = {
  id: string;
  spaceId: string;
  contactName: string;
  contactPhone: string | null;
  /** Minutes since local midnight, resolved on the server. */
  fromMin: number;
  toMin: number;
  label: string;
  priceCents: number;
  status: string;
  source: string;
  notes: string | null;
};

export type GridBlock = {
  id: string;
  spaceId: string | null;
  fromMin: number;
  toMin: number;
  reason: string | null;
};

/** One hour of grid, in pixels. Tall enough that a 30-minute slot is tappable. */
const HOUR = 64;

export function RentalGrid({
  spaces,
  rentals,
  blocks,
  fromMin,
  toMin,
  currency,
  locale,
  copy,
  onPick,
}: {
  spaces: GridSpace[];
  rentals: GridRental[];
  blocks: GridBlock[];
  fromMin: number;
  toMin: number;
  currency: string;
  locale: string;
  copy: Record<string, string>;
  /** Tapping empty space opens the counter's booking form, pre-filled. */
  onPick: (spaceId: string, hhmm: string) => void;
}) {
  const [open, setOpen] = useState<GridRental | null>(null);

  const money = (cents: number) => formatMoney(cents, currency, locale);
  const top = (min: number) => ((min - fromMin) / 60) * HOUR;
  const height = (from: number, to: number) => Math.max(((to - from) / 60) * HOUR, 22);

  const hours: number[] = [];
  for (let m = Math.floor(fromMin / 60) * 60; m <= toMin; m += 60) hours.push(m);

  const gridHeight = ((toMin - fromMin) / 60) * HOUR;

  return (
    <>
      {/*
        Courts across, hours down — the shape every club already reads, and
        the only one where "is anything free at eight" is a glance rather than
        a scroll through a list. The whole grid scrolls sideways on a phone,
        with the hour rail pinned so a column is never orphaned from its time.
      */}
      <div className="overflow-x-auto">
        <div className="flex min-w-max">
          <div className="sticky left-0 z-10 w-12 shrink-0 bg-paper">
            <div className="h-9" />
            <div className="relative" style={{ height: gridHeight }}>
              {hours.map((m) => (
                <span
                  key={m}
                  className="absolute -translate-y-1/2 pr-2 text-right text-[11px] tabular-nums text-muted"
                  style={{ top: top(m), width: "100%" }}
                >
                  {String(Math.floor(m / 60)).padStart(2, "0")}
                </span>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            {spaces.map((space) => {
              const mine = rentals.filter((r) => r.spaceId === space.id);
              const myBlocks = blocks.filter((b) => b.spaceId === null || b.spaceId === space.id);

              return (
                <div key={space.id} className="w-[132px] shrink-0 sm:w-[160px]">
                  <p className="flex h-9 items-center justify-center truncate rounded-t-[var(--radius-md)] bg-sunken px-2 text-xs font-medium text-ink">
                    {space.name}
                  </p>

                  <div
                    className="relative rounded-b-[var(--radius-md)] border border-line bg-surface"
                    style={{ height: gridHeight }}
                  >
                    {/* Hour lines, and the hours this court is shut. */}
                    {hours.map((m) => (
                      <span
                        key={m}
                        className="absolute inset-x-0 border-t border-line/70"
                        style={{ top: top(m) }}
                        aria-hidden
                      />
                    ))}

                    {space.openMin !== null && space.openMin > fromMin && (
                      <span
                        className="absolute inset-x-0 bg-sunken/70"
                        style={{ top: 0, height: top(space.openMin) }}
                        aria-hidden
                      />
                    )}
                    {space.closeMin !== null && space.closeMin < toMin && (
                      <span
                        className="absolute inset-x-0 bg-sunken/70"
                        style={{ top: top(space.closeMin), bottom: 0 }}
                        aria-hidden
                      />
                    )}

                    {/* Tap anywhere open to start a booking at that half hour. */}
                    {hours.flatMap((m) =>
                      [0, 30].map((half) => {
                        const at = m + half;
                        if (at < (space.openMin ?? fromMin) || at >= (space.closeMin ?? toMin)) return null;
                        return (
                          <button
                            key={`${m}-${half}`}
                            type="button"
                            onClick={() =>
                              onPick(
                                space.id,
                                `${String(Math.floor(at / 60)).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}`,
                              )
                            }
                            aria-label={copy.bookAt}
                            className="absolute inset-x-0 hover:bg-accent-soft/60"
                            style={{ top: top(at), height: HOUR / 2 }}
                          />
                        );
                      }),
                    )}

                    {myBlocks.map((b) => (
                      <span
                        key={b.id}
                        title={b.reason ?? copy.blocked}
                        className="pointer-events-none absolute inset-x-1 rounded-[6px] bg-[repeating-linear-gradient(45deg,var(--color-sunken)_0_6px,var(--color-line)_6px_12px)] px-1.5 py-1 text-[10px] text-muted"
                        style={{ top: top(b.fromMin), height: height(b.fromMin, b.toMin) }}
                      >
                        {b.reason ?? copy.blocked}
                      </span>
                    ))}

                    {mine.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setOpen(r)}
                        className={cn(
                          "absolute inset-x-1 overflow-hidden rounded-[6px] px-1.5 py-1 text-left",
                          r.status === "NO_SHOW"
                            ? "bg-critical-soft text-critical"
                            : r.status === "PENDING_PAYMENT"
                              ? "bg-caution-soft text-caution"
                              : "bg-accent text-white",
                        )}
                        style={{ top: top(r.fromMin), height: height(r.fromMin, r.toMin) }}
                      >
                        <span className="block truncate text-[11px] font-medium leading-tight">
                          {r.contactName}
                        </span>
                        <span className="block truncate text-[10px] leading-tight opacity-80">
                          {r.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Sheet open={Boolean(open)} onClose={() => setOpen(null)} title={open?.contactName ?? ""}>
        {open && (
          <div className="space-y-4">
            <div className="space-y-1 text-sm text-ink-soft">
              <p className="text-base font-medium text-ink">
                {spaces.find((s) => s.id === open.spaceId)?.name} · {open.label}
              </p>
              <p>{money(open.priceCents)}</p>
              {open.contactPhone && (
                <p>
                  <a href={`tel:${open.contactPhone}`} className="text-accent">
                    {open.contactPhone}
                  </a>
                </p>
              )}
              {open.notes && <p className="text-muted">{open.notes}</p>}
              <p className="text-xs uppercase tracking-widest text-muted">
                {open.source === "ONLINE" ? copy.sourceOnline : copy.sourceCounter}
              </p>
            </div>

            {open.status === "CONFIRMED" && (
              <div className="flex flex-wrap gap-2">
                <form action={markNoShowAction} onSubmit={() => setOpen(null)}>
                  <input type="hidden" name="id" value={open.id} />
                  <Button type="submit" variant="secondary" size="sm">
                    {copy.noShow}
                  </Button>
                </form>
                <form action={cancelRentalAction} onSubmit={() => setOpen(null)}>
                  <input type="hidden" name="id" value={open.id} />
                  <Button type="submit" variant="danger" size="sm">
                    <Icon name="x" className="size-4" />
                    {copy.cancel}
                  </Button>
                </form>
              </div>
            )}

            {open.status !== "CONFIRMED" && (
              <p className="rounded-[var(--radius-md)] bg-sunken px-3 py-2 text-sm text-muted">
                {open.status === "NO_SHOW" ? copy.wasNoShow : copy.awaitingPayment}
              </p>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}
