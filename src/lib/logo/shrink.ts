/** What the logo pickers offer; everything is redrawn as a PNG before it is sent. */
export const LOGO_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";

/** Longest side of a stored logo: sharp at the sizes it is shown, and small enough to store. */
const LOGO_SIDE = 512;

/**
 * Redraws the picked image as a PNG no larger than LOGO_SIDE, so a photo
 * straight off a phone stores in kilobytes and an SVG becomes something email
 * clients can show. Transparency survives; PNG keeps it.
 */
export async function shrinkLogo(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    // An SVG with no width or height of its own reports none; draw it square.
    const width = image.naturalWidth || LOGO_SIDE;
    const height = image.naturalHeight || LOGO_SIDE;
    // Vectors scale up cleanly; pixels are only ever made smaller.
    const fit = LOGO_SIDE / Math.max(width, height);
    const scale = file.type === "image/svg+xml" ? fit : Math.min(1, fit);

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("toBlob");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
