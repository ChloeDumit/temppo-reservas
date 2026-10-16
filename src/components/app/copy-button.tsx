"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

/** Copies a value, typically the booking link, and says so for a moment. */
export function CopyButton({
  value,
  label,
  copiedLabel,
  className,
}: {
  value: string;
  label: string;
  copiedLabel: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          // Clipboard blocked (an insecure origin, an old browser): the text
          // beside the button is selectable, so nothing is lost.
        }
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-sm font-medium text-ink transition-colors hover:border-accent",
        copied && "border-positive text-positive",
        className,
      )}
    >
      <Icon name={copied ? "check" : "share"} className="size-4" />
      {copied ? copiedLabel : label}
    </button>
  );
}
