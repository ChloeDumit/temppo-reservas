"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Sheet } from "@/components/ui/sheet";
import { Icon } from "@/components/app/icon";
import { RentalGrid, type GridBlock, type GridRental, type GridSpace } from "./rental-grid";
import { blockSpaceAction, createRentalAction } from "./actions";

/**
 * The day, and the two things a counter does with it: take a booking and
 * close a court. Both start from the grid — tapping an empty half hour opens
 * the form already filled in with the court and the time, because retyping
 * what you just pointed at is the whole reason paper is still faster.
 */
export function RentalsClient({
  date,
  spaces,
  rentals,
  blocks,
  fromMin,
  toMin,
  currency,
  locale,
  copy,
}: {
  date: string;
  spaces: GridSpace[];
  rentals: GridRental[];
  blocks: GridBlock[];
  fromMin: number;
  toMin: number;
  currency: string;
  locale: string;
  copy: Record<string, string>;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<{ spaceId: string; time: string } | null>(null);
  const [blocking, setBlocking] = useState(false);

  const [bookState, bookAction] = useActionState(createRentalAction, null);
  const [blockState, blockFormAction] = useActionState(blockSpaceAction, null);

  /*
    A successful action revalidates on the server; close the sheet and let the
    page repaint. In an effect rather than straight in the body — setting state
    while rendering is how a component ends up re-rendering itself forever.
  */
  useEffect(() => {
    if (bookState?.ok) setPicked(null);
  }, [bookState]);

  useEffect(() => {
    if (blockState?.ok) setBlocking(false);
  }, [blockState]);

  const space = spaces.find((s) => s.id === picked?.spaceId);
  const durations = space?.durationsMin?.length ? space.durationsMin : [60, 90];

  return (
    <>
      <div className="mb-4 flex items-center justify-end">
        <Button variant="secondary" size="sm" onClick={() => setBlocking(true)}>
          <Icon name="alert" className="size-4" />
          {copy.blockButton}
        </Button>
      </div>

      <RentalGrid
        spaces={spaces}
        rentals={rentals}
        blocks={blocks}
        fromMin={fromMin}
        toMin={toMin}
        currency={currency}
        locale={locale}
        copy={copy}
        onPick={(spaceId, time) => setPicked({ spaceId, time })}
      />

      <Sheet
        open={Boolean(picked)}
        onClose={() => setPicked(null)}
        title={space ? `${space.name} · ${picked?.time}` : copy.newRental}
      >
        <form action={bookAction} className="space-y-4">
          <input type="hidden" name="spaceId" value={picked?.spaceId ?? ""} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="time" value={picked?.time ?? ""} />

          <Field label={copy.duration}>
            <Select name="durationMin" defaultValue={String(durations[0])}>
              {durations.map((d) => (
                <option key={d} value={d}>
                  {d} min
                </option>
              ))}
            </Select>
          </Field>

          <Field label={copy.name}>
            <Input name="contactName" required autoComplete="off" />
          </Field>

          <Field label={copy.phone}>
            <Input name="contactPhone" inputMode="tel" autoComplete="off" />
          </Field>

          <Field label={copy.notes}>
            <Textarea name="notes" rows={2} />
          </Field>

          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" name="force" className="size-4" />
            {copy.force}
          </label>

          {bookState?.error && (
            <p className="text-sm text-critical">
              {bookState.error === "unavailable"
                ? copy.taken
                : bookState.error === "badDuration"
                  ? copy.badDuration
                  : copy.generic}
            </p>
          )}

          <SubmitButton className="w-full">{copy.confirm}</SubmitButton>
        </form>
      </Sheet>

      <Sheet open={blocking} onClose={() => setBlocking(false)} title={copy.blockTitle}>
        <form action={blockFormAction} className="space-y-4">
          <input type="hidden" name="date" value={date} />

          <Field label={copy.court}>
            <Select name="spaceId" defaultValue="">
              {/* Empty closes the whole club: rain stops every court at once. */}
              <option value="">{copy.allCourts}</option>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={copy.from}>
              <Input name="from" type="time" defaultValue="08:00" required />
            </Field>
            <Field label={copy.to}>
              <Input name="to" type="time" defaultValue="23:00" required />
            </Field>
          </div>

          <Field label={copy.reason}>
            <Input name="reason" placeholder={copy.reasonHint} />
          </Field>

          {blockState?.error && <p className="text-sm text-critical">{copy.generic}</p>}

          <SubmitButton className="w-full">{copy.blockConfirm}</SubmitButton>
        </form>
      </Sheet>
    </>
  );
}
