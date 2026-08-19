import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const base =
  "pressable inline-flex items-center justify-center gap-2 rounded-md font-medium disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap select-none";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white active:bg-accent-hover sm:hover:bg-accent-hover",
  secondary:
    "bg-surface text-ink border border-line-strong active:bg-sunken sm:hover:bg-sunken",
  ghost: "text-ink-soft active:bg-sunken active:text-ink sm:hover:bg-sunken sm:hover:text-ink",
  danger:
    "bg-critical-soft text-critical border border-critical/25 active:bg-critical active:text-white sm:hover:bg-critical sm:hover:text-white",
};

/*
  Touch first: 44px minimum on a phone, tightened on pointer devices where
  precision is higher and vertical space is at a premium.
*/
const sizes: Record<Size, string> = {
  sm: "min-h-11 px-3.5 text-sm sm:min-h-9 sm:px-3",
  md: "min-h-12 px-5 text-[15px] sm:min-h-10 sm:px-4 sm:text-sm",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(base, variants[variant], sizes[size], extra);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
};

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

type ButtonLinkProps = {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
};

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: ButtonLinkProps) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}
