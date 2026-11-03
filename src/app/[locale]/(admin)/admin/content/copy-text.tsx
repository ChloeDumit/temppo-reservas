"use client";

import { useState } from "react";

/** Copies the caption for posting by hand, and says so for a moment. */
export function CopyText({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="rounded-[var(--radius-pill)] bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20"
    >
      {done ? "¡Copiado!" : label}
    </button>
  );
}
