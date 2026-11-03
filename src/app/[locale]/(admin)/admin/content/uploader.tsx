"use client";

import { useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";

/** Matches PART_BYTES on the server: one part per request. */
const PART = 4 * 1024 * 1024;

/**
 * Uploads images and videos in 4 MB parts, so a reel of any size gets past
 * the function's request limit, then asks the server to stitch them together.
 */
export function MediaUploader({ postId, disabled }: { postId: string; disabled?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList) {
    setError(null);
    for (const [index, file] of [...files].entries()) {
      const uploadId = crypto.randomUUID();
      const parts = Math.max(1, Math.ceil(file.size / PART));
      try {
        for (let i = 0; i < parts; i++) {
          setStatus(`Subiendo ${file.name} (${index + 1}/${files.length}) · ${Math.round((i / parts) * 100)}%`);
          const res = await fetch(`/api/admin/content/upload/${uploadId}?part=${i}`, {
            method: "PUT",
            body: file.slice(i * PART, (i + 1) * PART),
          });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Error ${res.status}`);
        }
        setStatus(`Procesando ${file.name}…`);
        const res = await fetch(`/api/admin/content/upload/${uploadId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postId, filename: file.name, mimeType: file.type, parts }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Error ${res.status}`);
      } catch (e) {
        setError(`${file.name}: ${(e as Error).message}`);
        break;
      }
    }
    setStatus(null);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div>
      <label
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] border border-dashed border-white/20 px-4 py-6 text-center text-sm transition-colors hover:bg-white/5 ${
          disabled || status ? "pointer-events-none opacity-50" : ""
        }`}
      >
        <span className="font-medium">{status ?? "Subir imágenes o video"}</span>
        <span className="text-xs text-white/40">JPG, PNG o WebP (se pasan a JPEG) · MP4 o MOV. Para un carrusel, elegí varios a la vez.</span>
        <input
          ref={input}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
          className="sr-only"
          disabled={disabled || Boolean(status)}
          onChange={(e) => e.target.files?.length && upload(e.target.files)}
        />
      </label>
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
    </div>
  );
}
