/** Mirrors the server's limits in app/api/uploads/route.ts. */
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

const MAX_EDGE = 1600;
const OUTPUT = "image/webp";
const QUALITIES = [0.85, 0.7, 0.55, 0.4];

const draw = (bitmap: ImageBitmap): HTMLCanvasElement => {
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
};

const encode = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, OUTPUT, quality),
  );

/**
 * A phone photo is routinely larger than the 5MB the server takes, and an
 * iPhone one is HEIC, which it does not take at all. Re-encoding whatever the
 * browser can decode means picking the wrong kind of file is not the person's
 * problem to solve. WebP keeps transparency, so a logo survives the trip.
 */
export const toUploadableImage = async (file: File): Promise<File> => {
  if (ACCEPTED.has(file.type) && file.size <= MAX_BYTES) return file;

  // Anything this browser cannot decode - a HEIC outside Safari, say - goes up
  // untouched for the server to convert instead.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const canvas = draw(bitmap);
  bitmap.close();

  for (const quality of QUALITIES) {
    const blob = await encode(canvas, quality);
    if (blob && blob.size <= MAX_BYTES) {
      return new File([blob], "upload.webp", { type: OUTPUT });
    }
  }
  return file;
};
