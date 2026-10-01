"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  X,
} from "lucide-react";
import type { BodyPart } from "@/lib/mail/jmap-mail";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
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
    <div
      data-scroll-allow
      className="max-h-[85dvh] w-full max-w-4xl overflow-auto overscroll-contain rounded-[10px] bg-raised p-4 phone:max-h-full"
    >
      <pre className="font-mono text-xs whitespace-pre-wrap break-words text-ink phone:text-sm">
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
    <>
      {/* No sandbox attribute: Chrome's built-in PDF viewer refuses to render
          inside any sandboxed frame, even a permissive one. Safe here because
          the src is a local blob: URL built from bytes already fetched, not a
          live authenticated request the frame could navigate on its own. */}
      <iframe
        title="Attachment preview"
        src={state.objectUrl}
        className="h-[85dvh] w-full max-w-5xl rounded-[10px] border-2 border-line phone:h-full phone:rounded-none phone:border-0"
      />
      {/* Phones often show only the first page inside a frame. */}
      <a
        href={state.objectUrl}
        target="_blank"
        rel="noopener"
        className="press-flat absolute top-3 right-3 inline-flex min-h-11 items-center gap-2 rounded-[10px] border-2 border-white/30 bg-black/70 px-3 font-bold text-white pointer-fine:hidden"
      >
        <ExternalLink size={16} aria-hidden />
        Open
      </a>
    </>
  );
}

/** Image attachments side by side; swiping between them changes `index`. */
function ImageStrip({
  files,
  index,
  urls,
  onNavigate,
}: {
  files: BodyPart[];
  index: number;
  urls: string[];
  onNavigate: (index: number) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const images = files
    .map((part, i) => ({ part, i }))
    .filter(({ part }) => previewKind(part.type) === "image");

  // Buttons and arrow keys move the strip; a swipe that settles moves index.
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>(
      `[data-index="${index}"]`,
    );
    el?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [index]);

  useEffect(() => {
    const root = strip.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio > 0.6) {
            const next = Number((entry.target as HTMLElement).dataset.index);
            if (!Number.isNaN(next)) onNavigate(next);
          }
        }
      },
      { root, threshold: [0.6] },
    );
    root.querySelectorAll("[data-index]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [onNavigate]);

  return (
    <div
      ref={strip}
      data-scroll-allow
      className="flex h-full w-full snap-x snap-mandatory scroll-px-4 overflow-x-auto overscroll-x-contain"
    >
      {images.map(({ part, i }) => (
        <div
          key={part.blobId}
          data-index={i}
          className="flex h-full w-full shrink-0 snap-center items-center justify-center px-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={urls[i]}
            alt={part.name ?? "attachment"}
            className="h-full w-full min-w-0 object-contain"
          />
        </div>
      ))}
    </div>
  );
}

const ICON_BUTTON =
  "flex size-9 items-center justify-center rounded-[10px] text-white hover:bg-white/10 phone:size-11";

export function AttachmentPreview({
  files,
  index,
  viewing,
  onClose,
  onNavigate,
}: {
  files: BodyPart[];
  /** The attachment on screen, or null when closed. */
  index: number | null;
  viewing: string | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  // Keep the last attachment on screen while the sheet animates out.
  const [shown, setShown] = useState(index ?? 0);
  if (index != null && index !== shown) setShown(index);
  const at = Math.min(shown, Math.max(files.length - 1, 0));
  const part = files[at];
  if (!part) return null;
  const urls = files.map((file) => blobUrl(file, viewing));
  const url = urls[at];
  const kind = previewKind(part.type);
  const name = part.name ?? "attachment";
  const imageCount = files.filter(
    (file) => previewKind(file.type) === "image",
  ).length;
  const hasPrev = at > 0;
  const hasNext = at < files.length - 1;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowLeft" && hasPrev) onNavigate(at - 1);
    else if (event.key === "ArrowRight" && hasNext) onNavigate(at + 1);
  };

  return (
    <Sheet
      open={index != null}
      onClose={onClose}
      title={name}
      hideTitle
      presentation="full"
      desktop="none"
      bare
      className="bg-ink/80 text-white backdrop:bg-transparent dark:bg-surface/90 phone:bg-black phone:dark:bg-black desk:dark:backdrop:bg-transparent phone:dark:backdrop:bg-transparent"
    >
      <div
        onKeyDown={onKeyDown}
        className="flex min-h-0 flex-1 flex-col text-white"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 phone:gap-1 phone:border-b-2 phone:border-white/15 phone:bg-black phone:pt-[max(0.25rem,env(safe-area-inset-top))] phone:pr-[max(0.5rem,env(safe-area-inset-right))] phone:pb-1 phone:pl-[max(0.5rem,env(safe-area-inset-left))]">
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={cn(ICON_BUTTON, "desk:hidden")}
          >
            <X size={22} aria-hidden />
          </button>
          <p className="min-w-0 flex-1 truncate text-sm font-bold text-white phone:text-center">
            {name}
            <span className="ml-2 font-medium text-white/60">
              {size(part.size)}
            </span>
          </p>
          <div className="flex shrink-0 items-center gap-2 phone:gap-1">
            <a
              href={url}
              download={name}
              aria-label="Download"
              className={ICON_BUTTON}
            >
              <Download size={17} aria-hidden />
            </a>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className={cn(ICON_BUTTON, "phone:hidden")}
            >
              <X size={19} aria-hidden />
            </button>
          </div>
        </header>

        <div
          onClick={(event) => event.target === event.currentTarget && onClose()}
          className="relative flex min-h-0 flex-1 items-center justify-center px-5 pb-5 phone:px-0 phone:pb-0"
        >
          {files.length > 1 && hasPrev && (
            <button
              type="button"
              aria-label="Previous attachment"
              onClick={() => onNavigate(at - 1)}
              className="absolute left-2 z-10 flex size-10 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 phone:hidden"
            >
              <ChevronLeft size={22} aria-hidden />
            </button>
          )}

          <div className="flex max-h-full max-w-full items-center justify-center phone:h-full phone:min-h-0 phone:w-full phone:min-w-0">
            {kind === "image" &&
              (imageCount > 1 ? (
                <>
                  <div className="h-full w-full desk:hidden">
                    <ImageStrip
                      files={files}
                      index={at}
                      urls={urls}
                      onNavigate={onNavigate}
                    />
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={name}
                    className="max-h-[80dvh] max-w-full rounded-[10px] object-contain phone:hidden"
                  />
                </>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt={name}
                  className="max-h-[80dvh] max-w-full rounded-[10px] object-contain phone:h-full phone:max-h-none phone:w-full phone:min-w-0 phone:rounded-none"
                />
              ))}
            {kind === "video" && (
              <video
                src={url}
                controls
                className="max-h-[80dvh] max-w-full rounded-[10px] phone:max-h-full"
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

          {files.length > 1 && hasNext && (
            <button
              type="button"
              aria-label="Next attachment"
              onClick={() => onNavigate(at + 1)}
              className="absolute right-2 z-10 flex size-10 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 phone:hidden"
            >
              <ChevronRight size={22} aria-hidden />
            </button>
          )}
        </div>

        {/* Phone: prev/next are the primary control, at the bottom. */}
        <div className="flex shrink-0 items-center gap-2 border-t-2 border-white/15 bg-black px-[max(0.5rem,env(safe-area-inset-left))] pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] desk:hidden">
          <button
            type="button"
            aria-label="Previous attachment"
            disabled={!hasPrev}
            onClick={() => onNavigate(at - 1)}
            className={cn(ICON_BUTTON, "disabled:opacity-30")}
          >
            <ChevronLeft size={24} aria-hidden />
          </button>
          <p className="min-w-0 flex-1 text-center text-sm font-bold text-white/80">
            {at + 1} of {files.length}
          </p>
          {kind === "image" && (
            <a
              href={url}
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 text-sm font-bold text-white hover:bg-white/10"
            >
              <ExternalLink size={16} aria-hidden />
              Open original
            </a>
          )}
          <button
            type="button"
            aria-label="Next attachment"
            disabled={!hasNext}
            onClick={() => onNavigate(at + 1)}
            className={cn(ICON_BUTTON, "disabled:opacity-30")}
          >
            <ChevronRight size={24} aria-hidden />
          </button>
        </div>
      </div>
    </Sheet>
  );
}
