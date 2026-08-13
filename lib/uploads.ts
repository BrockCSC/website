import { randomUUID } from "node:crypto";
import { extname, join, normalize, sep } from "node:path";

/** Shared across every environment on the host, so preview envs see prod's images. */
export const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? "/data/uploads";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

export const isAllowedImageType = (type: string) => type in EXTENSION_BY_TYPE;

export const extensionForType = (type: string) => EXTENSION_BY_TYPE[type] ?? "";

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

export const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

export const contentTypeForPath = (path: string) =>
  CONTENT_TYPE_BY_EXTENSION[extname(path).toLowerCase()] ??
  "application/octet-stream";
