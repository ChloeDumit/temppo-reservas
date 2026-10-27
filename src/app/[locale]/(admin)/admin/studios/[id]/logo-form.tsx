"use client";

import { useState } from "react";
import { setStudioLogoAction } from "../../actions";
import { LOGO_ACCEPT, shrinkLogo } from "@/lib/logo/shrink";

/**
 * Uploads a logo on a studio's behalf. The picked image is shrunk to a PNG in
 * the browser, as in the studio's own settings, and appended on submit.
 */
export function StudioLogoForm({ studioId, logoUrl }: { studioId: string; logoUrl: string | null }) {
  const [logo, setLogo] = useState<Blob | null>(null);
  const [preview, setPreview] = useState(logoUrl ?? "");
  const [error, setError] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(false);
    try {
      const blob = await shrinkLogo(file);
      setLogo(blob);
      setPreview(URL.createObjectURL(blob));
    } catch {
      setError(true);
    }
  }

  function save(formData: FormData) {
    if (logo) formData.set("logo", logo, "logo.png");
    return setStudioLogoAction(formData);
  }

  return (
    <form action={save} className="mt-3 flex flex-wrap items-center gap-3">
      <input type="hidden" name="studioId" value={studioId} />
      <input type="hidden" name="returnTo" value={`/admin/studios/${studioId}`} />

      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-md)] border border-white/15 bg-white">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="size-full object-contain" />
        ) : (
          <span className="text-xs text-black/30">—</span>
        )}
      </div>

      <label className="cursor-pointer rounded-[var(--radius-pill)] bg-white/10 px-4 py-2 text-sm hover:bg-white/20">
        {preview ? "Elegir otra" : "Elegir imagen"}
        <input
          type="file"
          accept={LOGO_ACCEPT}
          className="sr-only"
          onChange={(event) => {
            void pick(event.target.files?.[0]);
            // Picking the same file again should still count.
            event.target.value = "";
          }}
        />
      </label>

      {logo && (
        <button
          type="submit"
          className="rounded-[var(--radius-pill)] bg-emerald-500/20 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-500/30"
        >
          Guardar logo
        </button>
      )}
      {logoUrl && !logo && (
        <button
          type="submit"
          name="remove"
          value="1"
          className="rounded-[var(--radius-pill)] px-3 py-2 text-sm text-white/60 hover:bg-white/10 hover:text-white"
        >
          Quitar logo
        </button>
      )}

      {error && <p className="w-full text-xs text-red-300">No se pudo leer esa imagen. Probá con un PNG o JPG.</p>}
    </form>
  );
}
