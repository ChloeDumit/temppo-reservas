"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { PHOTO_ACCEPT, shrinkPhoto } from "@/lib/logo/shrink";
import { Spinner } from "@/components/ui/spinner";
import { initials } from "@/lib/initials";
import { saveStaffPhotoAction } from "./actions";

/**
 * A professional's round photo, saved the moment it is picked: tap the circle
 * to choose one, cropped to a square on the phone before it is sent.
 */
export function StaffPhoto({ staffId, name, photoUrl }: { staffId: string; name: string; photoUrl: string | null }) {
  const t = useTranslations("hours");
  const [preview, setPreview] = useState(photoUrl);
  const [error, setError] = useState<string>();
  const [saving, startSaving] = useTransition();

  const send = (photo: Blob | null) =>
    startSaving(async () => {
      const form = new FormData();
      form.set("staffId", staffId);
      if (photo) form.set("photo", photo, "photo.jpg");
      else form.set("remove", "1");
      const result = await saveStaffPhotoAction(form);
      if (result?.error) {
        setPreview(photoUrl);
        setError(t(result.error === "photoTooBig" ? "photoTooBig" : "photoInvalid"));
      }
    });

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(undefined);
    try {
      const blob = await shrinkPhoto(file);
      setPreview(URL.createObjectURL(blob));
      send(blob);
    } catch {
      setError(t("photoInvalid"));
    }
  }

  return (
    <div className="flex items-center gap-4">
      <label className="group relative size-16 shrink-0 cursor-pointer" aria-label={preview ? t("photoChange") : t("photoAdd")}>
        <span
          className={cn(
            "flex size-full items-center justify-center overflow-hidden rounded-full ring-2 ring-surface shadow-[var(--shadow-soft)]",
            preview ? "bg-sunken" : "bg-accent-soft text-lg font-semibold text-accent-ink",
          )}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="size-full object-cover transition-opacity group-hover:opacity-85" />
          ) : (
            initials(name)
          )}
          {saving && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-surface/60">
              <Spinner />
            </span>
          )}
        </span>
        {/* A small camera badge: the circle itself is the button. */}
        <span className="absolute -bottom-0.5 -right-0.5 flex size-6 items-center justify-center rounded-full bg-accent text-white ring-2 ring-surface">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5" aria-hidden>
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" strokeLinejoin="round" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        </span>
        <input
          type="file"
          accept={PHOTO_ACCEPT}
          className="sr-only"
          disabled={saving}
          onChange={(event) => {
            void pick(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      <div className="min-w-0 text-sm">
        <p className="text-ink-soft">{t("photoHint")}</p>
        {preview && !saving && (
          <button
            type="button"
            onClick={() => {
              setPreview(null);
              send(null);
            }}
            className="mt-1 font-medium text-muted hover:text-critical"
          >
            {t("photoRemove")}
          </button>
        )}
        {error && <p className="mt-1 text-critical">{error}</p>}
      </div>
    </div>
  );
}
