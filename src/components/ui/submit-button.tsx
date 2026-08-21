"use client";

import { useFormStatus } from "react-dom";
import { Button } from "./button";
import { Spinner } from "./spinner";

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "md",
  className,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant={variant} size={size} className={className} disabled={pending}>
      {/*
        A spinner alongside the label, not instead of it. Swapping the text
        alone left the button looking merely disabled, which reads as broken
        rather than busy.
      */}
      {pending && <Spinner size={16} />}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
