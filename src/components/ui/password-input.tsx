"use client";

import { useState, type InputHTMLAttributes } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/app/icon";

/**
 * A password field you can read back.
 *
 * Every password in this app arrives by being read aloud or copied from a
 * message — a temporary one from the front desk, a PIN the studio chose. Typing
 * one blind on a phone keyboard is where sign-ins go to die, and the only
 * feedback on a typo is a rejection that looks like "wrong password".
 *
 * The toggle stays inside the input so it cannot be mistaken for a submit
 * button, and it is a real <button> so it is reachable by keyboard.
 */
export function PasswordInput({
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const t = useTranslations("auth");
  const [shown, setShown] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={shown ? "text" : "password"}
        className={cn(
          "w-full rounded-[var(--radius-md)] border border-line-strong bg-surface py-2.5 pl-3 pr-12 text-ink placeholder:text-muted transition-colors focus:border-accent sm:py-2",
          className,
        )}
      />

      <button
        type="button"
        onClick={() => setShown((current) => !current)}
        // Not in the tab order: it sits between the field and the submit button,
        // and stopping there on the way to signing in helps nobody.
        tabIndex={-1}
        aria-label={shown ? t("hidePassword") : t("showPassword")}
        aria-pressed={shown}
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded-[var(--radius-md)] p-2.5 text-muted transition-colors hover:text-ink"
      >
        <Icon name={shown ? "eyeOff" : "eye"} className="size-5" />
      </button>
    </div>
  );
}
