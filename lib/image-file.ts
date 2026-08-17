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

/** Falls back to the original file for the server to convert. */
export const toUploadableImage = async (file: File): Promise<File> => {
  if (ACCEPTED.has(file.type) && file.size <= MAX_BYTES) return file;

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
