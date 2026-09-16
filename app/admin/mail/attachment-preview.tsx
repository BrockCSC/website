"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import type { BodyPart } from "@/lib/mail/jmap-mail";
import { withAs } from "./inbox-picker";

export type PreviewKind = "image" | "pdf" | "text" | "audio" | "video";

const TEXT_PREVIEW = /^text\/(plain|csv|markdown)$|^application\/json$/i;
const TEXT_PREVIEW_MAX_BYTES = 512 * 1024;

/** What kind of inline preview a MIME type supports, or null to fall back
 *  to a plain download. Nothing here needs the blob route to change: Content-
 *  Disposition doesn't stop <img>/<video>/<audio> from loading inline, and
 *  the PDF/text previews fetch the bytes themselves rather than navigating
 *  the endpoint directly. */
export const previewKind = (type: string): PreviewKind | null => {
  const t = type.toLowerCase();
  if (t.startsWith("image/")) return "image";
  if (t === "application/pdf") return "pdf";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  if (TEXT_PREVIEW.test(t)) return "text";
  return null;
};

export const size = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export const blobUrl = (part: BodyPart, viewing: string | null) =>
  withAs(
    `/api/mail/blob/${encodeURIComponent(part.blobId!)}?name=${encodeURIComponent(
      part.name ?? "attachment",
    )}&type=${encodeURIComponent(part.type)}`,
    viewing,
  );

type Loadable<T> =
  { status: "loading" } | { status: "error" } | ({ status: "ready" } & T);

function TextPreview({ url, bytes }: { url: string; bytes: number }) {
  const [state, setState] = useState<
    Loadable<{ text: string }> | { status: "too-large" }
  >(
    bytes > TEXT_PREVIEW_MAX_BYTES
      ? { status: "too-large" }
      : { status: "loading" },
  );

  useEffect(() => {
    if (bytes > TEXT_PREVIEW_MAX_BYTES) return;
    let live = true;
    fetch(url)
      .then((res) => (res.ok ? res.text() : Promise.reject(res.status)))
      .then((text) => live && setState({ status: "ready", text }))
      .catch(() => live && setState({ status: "error" }));
    return () => {
      live = false;
    };
  }, [url, bytes]);

  if (state.status === "too-large")
    return (
      <p className="p-6 text-sm text-subtle">
        This file is too large to preview — download it instead.
      </p>
    );
  if (state.status === "loading")
    return <p className="p-6 text-sm text-subtle">Loading…</p>;
  if (state.status === "error")
    return <p className="p-6 text-sm text-brand">Could not load this file.</p>;
  return (
    <div className="max-h-[85vh] w-full max-w-4xl overflow-auto rounded-[10px] bg-raised p-4">
      <pre className="font-mono text-xs whitespace-pre-wrap break-words text-ink">
        {state.text}
      </pre>
    </div>
  );
}

function PdfPreview({ url }: { url: string }) {
  const [state, setState] = useState<Loadable<{ objectUrl: string }>>({
    status: "loading",
  });

  useEffect(() => {
    let live = true;
    let created: string | null = null;
    fetch(url)
      .then((res) => (res.ok ? res.blob() : Promise.reject(res.status)))
      .then((blob) => {
        if (!live) return;
        created = URL.createObjectURL(blob);
        setState({ status: "ready", objectUrl: created });
      })
      .catch(() => live && setState({ status: "error" }));
    return () => {
      live = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url]);

  if (state.status === "loading")
    return <p className="p-6 text-sm text-subtle">Loading…</p>;
  if (state.status === "error")
    return <p className="p-6 text-sm text-brand">Could not load this file.</p>;
  return (
    // No sandbox attribute: Chrome's built-in PDF viewer refuses to render
    // inside any sandboxed frame, even a permissive one. Safe here because
    // the src is a local blob: URL built from bytes already fetched, not a
    // live authenticated request the frame could navigate on its own.
    <iframe
      title="Attachment preview"
      src={state.objectUrl}
      className="h-[85vh] w-full max-w-5xl rounded-[10px] border-2 border-line"
    />
  );
}

export function AttachmentPreview({
  files,
  index,
  viewing,
  onClose,
  onNavigate,
}: {
  files: BodyPart[];
  index: number;
  viewing: string | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const part = files[index];
  const url = blobUrl(part, viewing);
  const kind = previewKind(part.type);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
      else if (event.key === "ArrowRight" && index < files.length - 1)
        onNavigate(index + 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, onNavigate, index, files.length]);

  // Portaled to the document body for the same reason as the compose
  // modal: <main>'s fade-in animation creates a stacking context that
  // would otherwise trap this overlay below the mobile tab bar.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={part.name ?? "Attachment preview"}
      className="fixed inset-0 z-50 flex animate-fade-in flex-col bg-ink/80"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="min-w-0 truncate text-sm font-bold text-white">
          {part.name ?? "attachment"}
          <span className="ml-2 font-medium text-white/60">
            {size(part.size)}
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={url}
            download={part.name ?? "attachment"}
            aria-label="Download"
            className="flex size-9 items-center justify-center rounded-[10px] text-white hover:bg-white/10"
          >
            <Download size={17} aria-hidden />
          </a>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-[10px] text-white hover:bg-white/10"
          >
            <X size={19} aria-hidden />
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-5 pb-5">
        {files.length > 1 && index > 0 && (
          <button
            type="button"
            aria-label="Previous attachment"
            onClick={() => onNavigate(index - 1)}
            className="absolute left-2 flex size-10 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
          >
            <ChevronLeft size={22} aria-hidden />
          </button>
        )}

        <div className="flex max-h-full max-w-full items-center justify-center">
          {kind === "image" && (
            <img
              src={url}
              alt={part.name ?? "attachment"}
              className="max-h-[80vh] max-w-full rounded-[10px] object-contain"
            />
          )}
          {kind === "video" && (
            <video
              src={url}
              controls
              className="max-h-[80vh] max-w-full rounded-[10px]"
            />
          )}
          {kind === "audio" && (
            <audio src={url} controls className="w-full max-w-md" />
          )}
          {kind === "text" && (
            <TextPreview key={url} url={url} bytes={part.size} />
          )}
          {kind === "pdf" && <PdfPreview key={url} url={url} />}
          {!kind && (
            <p className="rounded-[10px] bg-surface px-6 py-4 text-sm font-bold text-ink">
              No preview available for this file type.
            </p>
          )}
        </div>

        {files.length > 1 && index < files.length - 1 && (
          <button
            type="button"
            aria-label="Next attachment"
            onClick={() => onNavigate(index + 1)}
            className="absolute right-2 flex size-10 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
          >
            <ChevronRight size={22} aria-hidden />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
