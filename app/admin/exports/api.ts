import { ApiError, apiFetch } from "@/lib/api/client";
import type {
  ExportListing,
  ExportParamValues,
  ExportPreview,
} from "@/lib/exports/types";

export const errorText = (err: unknown, fallback: string) =>
  err instanceof ApiError && err.detail ? err.detail : fallback;

export const fetchExports = () => apiFetch<ExportListing>("/api/exports");

export const fetchExportPreview = (id: string, params: ExportParamValues) =>
  apiFetch<{ preview: ExportPreview }>(
    `/api/exports/${id}/preview?${new URLSearchParams(params)}`,
  );

export type BuiltExport = { blob: Blob; filename: string };

/** Fetched rather than linked, so a 400 or 429 shows on the card instead of opening a JSON page. */
export const buildExport = async (
  id: string,
  params: ExportParamValues,
): Promise<BuiltExport> => {
  const res = await fetch(`/api/exports/${id}?${new URLSearchParams(params)}`, {
    credentials: "same-origin",
  });
  if (!res.ok) {
    // A crash or proxy error answers with HTML, not JSON.
    const body = (await res.json().catch(() => null)) as {
      error?: unknown;
    } | null;
    throw new ApiError(
      res.status,
      "GET /api/exports failed",
      typeof body?.error === "string" ? body.error : undefined,
    );
  }
  const blob = await res.blob();
  const filename =
    /filename="([^"]+)"/.exec(
      res.headers.get("content-disposition") ?? "",
    )?.[1] ?? `${id}.pdf`;
  return { blob, filename };
};

/** Saves a built PDF through a temporary object URL. */
export const saveExport = ({ blob, filename }: BuiltExport) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
};

/** The PDF as a File the share sheet takes, or null where it can't share files. */
export const shareableFile = ({ blob, filename }: BuiltExport): File | null => {
  if (typeof navigator === "undefined" || !navigator.canShare) return null;
  const file = new File([blob], filename, { type: "application/pdf" });
  try {
    return navigator.canShare({ files: [file] }) ? file : null;
  } catch {
    return null;
  }
};
