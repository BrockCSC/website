import decodeHeic from "heic-decode";
import sharp, { type Sharp } from "sharp";

const MAX_EDGE = 1600;
const QUALITY = 82;
const MAX_PIXELS = 268_402_689;

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  new TextDecoder("latin1").decode(bytes.subarray(start, end));

const isHeic = (bytes: Uint8Array) =>
  ascii(bytes, 4, 8) === "ftyp" &&
  /heic|heix|hevc|hevx|mif1|msf1/.test(ascii(bytes, 8, 32));

const fromHeic = async (bytes: Uint8Array): Promise<Sharp> => {
  const { width, height, data } = await decodeHeic({
    buffer: Buffer.from(bytes),
  });
  if (width * height > MAX_PIXELS) throw new Error("Too many pixels.");
  return sharp(Buffer.from(data), { raw: { width, height, channels: 4 } });
};

/** Null when the bytes are not an image sharp or libheif can read. */
export const toStorableImage = async (
  bytes: Uint8Array,
): Promise<Buffer | null> => {
  try {
    const image = isHeic(bytes)
      ? await fromHeic(bytes)
      : sharp(bytes, {
          limitInputPixels: MAX_PIXELS,
          failOn: "error",
        }).rotate();

    return await image
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: QUALITY })
      .toBuffer();
  } catch {
    return null;
  }
};
