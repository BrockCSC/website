import { createHash, randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { sniffImageType } from "@/lib/uploads";

/**
 * Deliberately its own root, never lib/uploads.ts's UPLOAD_ROOT: that pipeline
 * is served publicly at a permanently-cached URL with no auth check. Bank and
 * legal documents must never share it.
 */
const DOCUMENTS_ROOT = process.env.DOCUMENTS_DIR ?? "/data/documents";

export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

const EXTENSION_BY_TYPE: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    ".docx",
  "text/plain": ".txt",
};

/** What a human can upload through the multipart routes. */
export const ALLOWED_DOCUMENT_TYPES = Object.keys(EXTENSION_BY_TYPE);

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  Buffer.from(bytes.subarray(start, end)).toString("latin1");

/**
 * Only pdf, png and jpeg have magic bytes worth checking against the
 * browser-declared type. docx is a zip container indistinguishable from any
 * other zip by signature alone, and a generated .txt certificate has none —
 * both are trusted at the declared (allowlisted) type, same as the rest of
 * this app trusts non-image uploads.
 */
export const sniffDocumentType = (
  bytes: Uint8Array,
  declaredType: string,
): boolean => {
  if (declaredType === "application/pdf") {
    return ascii(bytes, 0, 5) === "%PDF-";
  }
  if (declaredType === "image/png" || declaredType === "image/jpeg") {
    return sniffImageType(bytes) === declaredType;
  }
  if (
    declaredType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return (
      bytes.length >= 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      bytes[2] === 0x03 &&
      bytes[3] === 0x04
    );
  }
  return declaredType === "text/plain";
};

/** Random name keyed by date, mirroring lib/uploads.ts's convention. */
const documentNameFor = (contentType: string, now = new Date()) => {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}/${mm}/${randomUUID()}${EXTENSION_BY_TYPE[contentType] ?? ""}`;
};

/** Resolves a stored filename inside DOCUMENTS_ROOT, or null if it escapes. */
const resolveDocumentPath = (storedFilename: string): string | null => {
  const relative = normalize(storedFilename);
  if (relative.startsWith("..") || relative.startsWith(sep)) return null;
  const resolved = join(DOCUMENTS_ROOT, relative);
  return resolved.startsWith(DOCUMENTS_ROOT + sep) ? resolved : null;
};

export const documentFilePath = (storedFilename: string): string | null =>
  resolveDocumentPath(storedFilename);

export const storeDocumentBytes = async (
  bytes: Uint8Array,
  contentType: string,
): Promise<{ storedFilename: string; sha256: string }> => {
  const storedFilename = documentNameFor(contentType);
  const target = resolveDocumentPath(storedFilename);
  if (!target) throw new Error("Generated an invalid storage path.");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return {
    storedFilename,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
};

export const deleteDocumentFile = async (
  storedFilename: string,
): Promise<void> => {
  const target = resolveDocumentPath(storedFilename);
  if (!target) return;
  await unlink(target).catch(() => {});
};
