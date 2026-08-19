"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};

/** Pulls the token out of either a full check-in URL or a bare code. */
function tokenFrom(raw: string) {
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed);
    return url.searchParams.get("token") ?? trimmed;
  } catch {
    return trimmed;
  }
}

export function CheckInScanner() {
  const t = useTranslations("checkin");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Resolved after mount: checking for the API during render would make the
  // first client paint disagree with the server and break hydration.
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    setSupported("BarcodeDetector" in window);
  }, []);

  const stop = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  };

  // Always release the camera when this screen goes away.
  useEffect(() => stop, []);

  useEffect(() => {
    if (!scanning || !supported) return;

    let cancelled = false;
    let frame = 0;

    const run = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const Detector = (
          window as unknown as {
            BarcodeDetector: new (options: { formats: string[] }) => BarcodeDetectorLike;
          }
        ).BarcodeDetector;
        const detector = new Detector({ formats: ["qr_code"] });

        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              const token = tokenFrom(codes[0].rawValue);
              stop();
              // Full navigation so the server route handles auth and redirects.
              window.location.href = `/api/checkin?token=${encodeURIComponent(token)}`;
              return;
            }
          } catch {
            // A frame that can't be decoded is normal; keep going.
          }
          frame = requestAnimationFrame(() => void tick());
        };

        void tick();
      } catch {
        if (!cancelled) {
          setError(t("cameraDenied"));
          setScanning(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning, supported]);

  return (
    <div className="space-y-4">
      {supported === null ? (
        <div className="aspect-video w-full animate-pulse rounded-lg border border-line bg-sunken" />
      ) : supported ? (
        <>
          <div className="overflow-hidden rounded-lg border border-line bg-ink/5">
            <video
              ref={videoRef}
              playsInline
              muted
              className={scanning ? "aspect-video w-full object-cover" : "hidden"}
            />
            {!scanning && (
              <div className="flex aspect-video items-center justify-center text-sm text-muted">
                {t("scan")}
              </div>
            )}
          </div>
          <Button
            type="button"
            variant={scanning ? "secondary" : "primary"}
            onClick={() => (scanning ? stop() : setScanning(true))}
          >
            {scanning ? t("stopScan") : t("scan")}
          </Button>
        </>
      ) : (
        <p className="rounded-md bg-caution-soft px-3 py-2 text-sm text-caution">
          {t("cameraUnsupported")}
        </p>
      )}

      {error && <p className="text-sm text-critical">{error}</p>}

      <form action="/api/checkin" method="get" className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <label htmlFor="token" className="mb-1.5 block text-sm font-medium text-ink-soft">
            {t("manual")}
          </label>
          <Input id="token" name="token" required autoComplete="off" />
        </div>
        <Button type="submit" variant="secondary">
          {t("submit")}
        </Button>
      </form>
    </div>
  );
}
