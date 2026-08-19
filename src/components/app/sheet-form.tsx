"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Icon } from "./icon";

/**
 * Lets a form deep inside the sheet dismiss it after a successful save,
 * without passing a callback across the server/client boundary.
 */
const SheetCloseContext = createContext<() => void>(() => {});

export function useSheetClose() {
  return useContext(SheetCloseContext);
}

/**
 * Opens a form in a bottom sheet. Replaces the inline accordions the app used
 * to use: on a phone a sheet keeps the form in the thumb zone and stops long
 * forms from pushing the page around.
 */
export function SheetForm({
  label,
  title,
  children,
  variant = "primary",
  size = "sm",
  icon = "plus",
  className,
}: {
  label: string;
  title: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  icon?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        {icon && <Icon name={icon} className="size-4" />}
        {label}
      </Button>

      <Sheet open={open} onClose={close} title={title}>
        <SheetCloseContext.Provider value={close}>{children}</SheetCloseContext.Provider>
      </Sheet>
    </>
  );
}
