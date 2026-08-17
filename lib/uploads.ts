import { randomUUID } from "node:crypto";
import { extname, join, normalize, sep } from "node:path";

/** Shared across every environment on the host, so preview envs see prod's images. */
export const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? "/data/uploads";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** What we accept in order to convert it; only the result has to be small. */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

export const isAllowedImageType = (type: string) => type in EXTENSION_BY_TYPE;

const extensionForType = (type: string) => EXTENSION_BY_TYPE[type] ?? "";

/** Random name keyed by date; the original filename is never trusted. */
export const uploadNameFor = (contentType: string, now = new Date()) => {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}/${mm}/${randomUUID()}${extensionForType(contentType)}`;
};

/**
 * Resolves a request path inside UPLOAD_ROOT, or null if it escapes.
 * Without this, `..%2f..%2fetc/passwd` would be readable.
 */
export const resolveUploadPath = (segments: string[]): string | null => {
  if (segments.some((s) => !s || s === "." || s === "..")) return null;
  const relative = normalize(segments.join("/"));
  if (relative.startsWith("..") || relative.startsWith(sep)) return null;
  const resolved = join(UPLOAD_ROOT, relative);
  return resolved.startsWith(UPLOAD_ROOT + sep) ? resolved : null;
};

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  Buffer.from(bytes.subarray(start, end)).toString("latin1");

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  signature.every((byte, i) => bytes[i] === byte);

/**
 * The browser's declared type is just a header, so the extension and the
 * served content-type would otherwise both derive from something a caller
 * controls. Reading the actual magic bytes keeps the two honest.
 */
export const sniffImageType = (bytes: Uint8Array): string | null => {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (["GIF87a", "GIF89a"].includes(ascii(bytes, 0, 6))) return "image/gif";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return "image/webp";
  }
  // Encoders differ on whether "avif" is the major brand or only a compatible
  // one, so look across the whole ftyp box rather than at byte 8 alone.
  if (ascii(bytes, 4, 8) === "ftyp" && /avif|avis/.test(ascii(bytes, 8, 64))) {
    return "image/avif";
  }
  return null;
};

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(EXTENSION_BY_TYPE).map(([type, ext]) => [ext, type]),
  ),
  ".jpeg": "image/jpeg",
};

export const contentTypeForPath = (path: string) =>
  CONTENT_TYPE_BY_EXTENSION[extname(path).toLowerCase()] ??
  "application/octet-stream";
