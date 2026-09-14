import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { EncryptedPDFError, PDFDocument } from "pdf-lib";

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

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  Buffer.from(bytes.subarray(start, end)).toString("latin1");

type PdfCheck = { ok: true } | { ok: false; status: 400 | 415; error: string };

/**
 * Human uploads are PDF only, since fields are placed on rendered PDF pages
 * and stamped into the file. The browser-declared type is ignored; the bytes
 * decide. pdf-lib refuses encrypted files unless told to ignore encryption,
 * and those could never be stamped.
 */
export const checkUploadedPdf = async (
  bytes: Uint8Array,
): Promise<PdfCheck> => {
  if (ascii(bytes, 0, 5) !== "%PDF-") {
    return {
      ok: false,
      status: 415,
      error:
        "Only PDF files can be uploaded. Export or print the file to PDF first.",
    };
  }
  try {
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    if (pdf.getPageCount() < 1) {
      return { ok: false, status: 400, error: "That PDF has no pages." };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      status: 400,
      error:
        err instanceof EncryptedPDFError
          ? "That PDF is password-protected or encrypted. Save an unprotected copy and upload that."
          : "That PDF could not be read. It may be damaged, so export it again and retry.",
    };
  }
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

export const readDocumentBytes = async (
  storedFilename: string,
): Promise<Uint8Array> => {
  const target = resolveDocumentPath(storedFilename);
  if (!target) throw new Error("Invalid storage path.");
  return new Uint8Array(await readFile(target));
};

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
