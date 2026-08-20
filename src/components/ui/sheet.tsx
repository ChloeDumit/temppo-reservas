"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

/**
 * Bottom sheet — the mobile answer to a modal. Slides up from the thumb end,
 * drags down to dismiss, and stays a centred panel on desktop where a
 * bottom-anchored sheet would look odd.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragStart = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  useEffect(() => setMounted(true), []);

  // Escape to close, and hold the background still while the sheet is up.
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open) setDragY(0);
  }, [open]);

  if (!mounted || !open) return null;

  const handleTouchStart = (event: React.TouchEvent) => {
    dragStart.current = event.touches[0].clientY;
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    if (dragStart.current === null) return;
    const delta = event.touches[0].clientY - dragStart.current;
    // Only follow downward drags; upward does nothing.
    if (delta > 0) setDragY(delta);
  };

  const handleTouchEnd = () => {
    // Past a third of the panel, let it go.
    const height = panelRef.current?.offsetHeight ?? 400;
    if (dragY > Math.min(140, height / 3)) onClose();
    else setDragY(0);
    dragStart.current = null;
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="close"
        onClick={onClose}
        className="fade-enter absolute inset-0 bg-ink/35 backdrop-blur-[2px]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "sheet-enter relative flex max-h-[92dvh] w-full flex-col bg-surface shadow-2xl",
          "rounded-t-[var(--radius-sheet)] sm:max-w-lg sm:rounded-[var(--radius-lg)]",
        )}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}
      >
        {/* Drag handle: the affordance that says "pull me down". */}
        <div
          className="flex shrink-0 cursor-grab justify-center pb-1 pt-2.5 sm:hidden"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <span className="h-1 w-9 rounded-full bg-line-strong" />
        </div>

        {title && (
          <div className="shrink-0 px-5 pb-3 pt-2 sm:pt-5">
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-line px-5 py-3 pb-nav-safe">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Button + sheet in one, for the common "open a form" case. */
export function SheetTrigger({
  label,
  title,
  children,
  className,
  variant = "primary",
}: {
  label: ReactNode;
  title: string;
  children: ReactNode | ((close: () => void) => ReactNode);
  className?: string;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "pressable touch-target inline-flex items-center justify-center gap-2 rounded-md px-4 text-sm font-medium",
          variant === "primary"
            ? "bg-accent text-white"
            : "border border-line-strong bg-surface text-ink",
          className,
        )}
      >
        {label}
      </button>
      <Sheet open={open} onClose={close} title={title}>
        {typeof children === "function" ? children(close) : children}
      </Sheet>
    </>
  );
}
