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

/** What the photo pickers offer: photos only, no vectors. */
export const PHOTO_ACCEPT = "image/png,image/jpeg,image/webp";

/** Side of a stored staff photo: crisp in a round avatar on a phone, a few dozen kB. */
const PHOTO_SIDE = 400;

/**
 * Crops the picked photo to its centre square and redraws it as a JPEG of
 * PHOTO_SIDE, since it is only ever shown in a circle.
 */
export async function shrinkPhoto(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    if (!side) throw new Error("empty");
    const out = Math.min(PHOTO_SIDE, side);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = out;
    canvas
      .getContext("2d")
      ?.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, out, out);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    if (!blob) throw new Error("toBlob");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
