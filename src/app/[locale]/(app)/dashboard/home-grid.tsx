"use client";

import { Children, isValidElement, useMemo, useState, useTransition, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/app/icon";
import { saveHomeLayoutAction } from "./actions";

type SlotProps = {
  id: string;
  title: string;
  /** Grid span classes for this widget. */
  span?: string;
  /** Nothing to show right now (no deposits owed, say): leave it out. */
  empty?: boolean;
  children?: ReactNode;
};

/** One widget's place on the home panel. Rendered by HomeGrid, never on its own. */
export function HomeSlot({ children }: SlotProps) {
  return <>{children}</>;
}

export type HomeLayout = { order: string[]; hidden: string[] } | null;

/**
 * The home panel's widgets, in the order this person chose, minus the ones
 * she hid. "Personalizar" turns on arrows to move each one and a button to
 * hide it — arrows rather than dragging, because dragging is unreliable on a
 * tablet's touch screen. The layout is saved to her account, so it is the
 * same on the phone, the tablet on the counter and the computer.
 */
export function HomeGrid({ layout, children }: { layout: HomeLayout; children: ReactNode }) {
  const t = useTranslations("home");
  const slots = useMemo(
    () =>
      Children.toArray(children).filter(
        (child): child is ReactElement<SlotProps> => isValidElement(child) && typeof (child.props as SlotProps).id === "string",
      ),
    [children],
  );
  const defaults = slots.map((s) => s.props.id);

  // Saved order first, then anything added since she last arranged it.
  const initialOrder = useMemo(() => {
    const saved = (layout?.order ?? []).filter((id) => defaults.includes(id));
    return [...saved, ...defaults.filter((id) => !saved.includes(id))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, defaults.join()]);

  const [order, setOrder] = useState(initialOrder);
  const [hidden, setHidden] = useState<string[]>(layout?.hidden ?? []);
  const [editing, setEditing] = useState(false);
  const [saving, startSaving] = useTransition();

  const byId = new Map(slots.map((s) => [s.props.id, s]));
  const visible = order.filter((id) => byId.has(id) && !hidden.includes(id));
  // While arranging, widgets with nothing to show still get a place to move.
  const shown = editing ? visible : visible.filter((id) => !byId.get(id)!.props.empty);

  const move = (id: string, dir: -1 | 1) => {
    setOrder((current) => {
      // Move among the visible ones, so a hidden widget never eats a step.
      const vis = current.filter((x) => !hidden.includes(x) && byId.has(x));
      const i = vis.indexOf(id);
      const j = i + dir;
      if (j < 0 || j >= vis.length) return current;
      const swapWith = vis[j];
      const next = [...current];
      const a = next.indexOf(id);
      const b = next.indexOf(swapWith);
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
  };

  const finish = () =>
    startSaving(async () => {
      await saveHomeLayoutAction({ order, hidden });
      setEditing(false);
    });

  const reset = () =>
    startSaving(async () => {
      await saveHomeLayoutAction(null);
      setOrder(defaults);
      setHidden([]);
      setEditing(false);
    });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        {editing ? (
          <>
            <p className="mr-auto text-sm text-muted">{t("arrangeHint")}</p>
            <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={saving}>
              {t("reset")}
            </Button>
            <Button type="button" size="sm" onClick={finish} disabled={saving}>
              {t("done")}
            </Button>
          </>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Icon name="settings" className="size-4" />
            {t("customize")}
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-flow-row-dense md:grid-cols-2 xl:grid-cols-3">
        {shown.map((id, index) => {
          const slot = byId.get(id)!;
          return (
            <div key={id} className={cn("relative flex flex-col", slot.props.span, editing && "rounded-[var(--radius-lg)] ring-2 ring-accent/40 ring-offset-2 ring-offset-paper")}>
              {editing && (
                <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full bg-surface p-1 shadow-[var(--shadow-lift)]">
                  <button
                    type="button"
                    onClick={() => move(id, -1)}
                    disabled={index === 0}
                    aria-label={t("moveUp", { name: slot.props.title })}
                    className="grid size-9 place-items-center rounded-full text-ink hover:bg-sunken disabled:opacity-30"
                  >
                    <Icon name="arrowUp" className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(id, 1)}
                    disabled={index === shown.length - 1}
                    aria-label={t("moveDown", { name: slot.props.title })}
                    className="grid size-9 place-items-center rounded-full text-ink hover:bg-sunken disabled:opacity-30"
                  >
                    <Icon name="arrowDown" className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setHidden((h) => [...h, id])}
                    aria-label={t("hide", { name: slot.props.title })}
                    className="grid size-9 place-items-center rounded-full text-ink hover:bg-sunken"
                  >
                    <Icon name="eyeOff" className="size-4" />
                  </button>
                </div>
              )}
              {slot.props.empty && editing ? (
                <div className="card grid min-h-24 place-items-center p-4 text-center text-sm text-muted">
                  {slot.props.title} · {t("emptyNow")}
                </div>
              ) : (
                slot
              )}
            </div>
          );
        })}
      </div>

      {editing && hidden.filter((id) => byId.has(id)).length > 0 && (
        <div className="mt-5 rounded-[var(--radius-lg)] border border-dashed border-line-strong p-4">
          <p className="mb-2 text-sm font-medium text-ink">{t("hiddenWidgets")}</p>
          <div className="flex flex-wrap gap-2">
            {hidden
              .filter((id) => byId.has(id))
              .map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setHidden((h) => h.filter((x) => x !== id))}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink hover:border-accent"
                >
                  <Icon name="plus" className="size-4" />
                  {byId.get(id)!.props.title}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
