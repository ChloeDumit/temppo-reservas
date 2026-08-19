import "server-only";
import QRCode from "qrcode";

/** Inline SVG so the code renders without an extra request or client JS. */
export async function qrSvg(value: string, size = 160) {
  return QRCode.toString(value, {
    type: "svg",
    margin: 1,
    width: size,
    color: { dark: "#1c1917", light: "#ffffff" },
    errorCorrectionLevel: "M",
  });
}

export function checkInUrl(token: string) {
  const base = process.env.APP_URL || "http://localhost:3000";
  const path = process.env.NEXT_PUBLIC_BASE_PATH || "";
  return `${base}${path}/api/checkin?token=${token}`;
}
