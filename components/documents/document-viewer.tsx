"use client";

import { Download, ExternalLink, Share, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { Sheet } from "@/components/ui/sheet";
import { loadPdfjs } from "@/lib/documents/load-pdfjs";
import { cn } from "@/lib/utils";

// The phone full-screen document viewer (spec §3.7 step 1). The page owns
// `useStackParam('view', { push: PHONE_QUERY })` and resolves its value to a
// file; this component only draws it. Pages render stacked and lazily, the
// same way components/documents/signing/document-pages.tsx does (copied, not
// imported: that file belongs to the signing flow). Native pinch only.

export type ViewerFile = {
  url: string;
  /** Shown in the top bar and used as the download / share file name. */
  name: string;
  contentType: string;
};

type Size = { width: number; height: number };

type Loaded =
  | { kind: "pdf"; doc: PDFDocumentProxy; sizes: Size[]; blob: Blob }
  | { kind: "image"; url: string; blob: Blob }
  | { kind: "text"; body: string; blob: Blob };

const CSS_PX_PER_PT = 96 / 72;

/** One fetch per file: the bytes feed pdf.js and the shared File alike. */
const useViewerDocument = (url: string) => {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let doc: PDFDocumentProxy | undefined;
    let objectUrl: string | undefined;
    void (async () => {
      try {
        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok) throw new Error("fetch failed");
        const type = res.headers.get("content-type") ?? "";
        const blob = await res.blob();
        if (cancelled) return;
        if (type.startsWith("image/")) {
          objectUrl = URL.createObjectURL(blob);
          setLoaded({ kind: "image", url: objectUrl, blob });
          return;
        }
        if (type.startsWith("text/plain")) {
          const body = await blob.text();
          if (!cancelled) setLoaded({ kind: "text", body, blob });
          return;
        }
        if (!type.startsWith("application/pdf")) throw new Error("type");
        const pdfjs = await loadPdfjs();
        // pdf.js transfers (detaches) the buffer it's given: hand it a copy.
        const data = new Uint8Array(await blob.arrayBuffer());
        const opened = await pdfjs.getDocument({ data }).promise;
        doc = opened;
        if (cancelled) {
          void opened.destroy();
          return;
        }
        const sizes = await Promise.all(
          Array.from({ length: opened.numPages }, async (_, i) => {
            const page = await opened.getPage(i + 1);
            const viewport = page.getViewport({ scale: CSS_PX_PER_PT });
            return { width: viewport.width, height: viewport.height };
          }),
        );
        if (!cancelled) setLoaded({ kind: "pdf", doc: opened, sizes, blob });
      } catch {
        if (!cancelled) setError("Could not load this document.");
      }
    })();
    return () => {
      cancelled = true;
      void doc?.destroy();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return { loaded, error };
};

function PdfPage({
  doc,
  number,
  total,
  size,
  width,
}: {
  doc: PDFDocumentProxy;
  number: number;
  total: number;
  size: Size;
  /** Available width, borders excluded. */
  width: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const shown = Math.min(width, size.width);
  // Re-rendering on every pixel of a resize thrashes the worker.
  const renderWidth = Math.min(size.width, Math.ceil(shown / 64) * 64);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setNear(entry.isIntersecting),
      { rootMargin: "150% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    if (!near || !renderWidth) {
      // Far-away pages give their bitmap back.
      el.width = 0;
      el.height = 0;
      return;
    }
    let cancelled = false;
    let task: RenderTask | undefined;
    void (async () => {
      const page = await doc.getPage(number);
      if (cancelled) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const natural = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: (renderWidth / natural.width) * ratio,
      });
      const ctx = el.getContext("2d");
      if (!ctx) return;
      el.width = Math.floor(viewport.width);
      el.height = Math.floor(viewport.height);
      task = page.render({ canvasContext: ctx, viewport });
      try {
        await task.promise;
      } catch {
        // cancel() rejects by design.
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, near, number, renderWidth]);

  return (
    <section
      aria-label={`Page ${number} of ${total}`}
      className="mx-auto w-full"
      data-viewer-page={number}
      style={{ maxWidth: size.width + 4 }}
    >
      <div
        className="relative w-full overflow-hidden rounded-[4px] border-2 border-line bg-white"
        ref={box}
        style={{ aspectRatio: `${size.width} / ${size.height}` }}
      >
        <p className="absolute inset-0 flex items-center justify-center text-sm font-bold text-neutral-400">
          Loading page {number}…
        </p>
        <canvas className="absolute inset-0 size-full" ref={canvas} />
      </div>
    </section>
  );
}

const useElementWidth = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry.contentRect.width)),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
};

/** Which page's middle is nearest the middle of the scroller. */
const usePageInView = (
  root: React.RefObject<HTMLDivElement | null>,
  total: number,
) => {
  const [page, setPage] = useState(1);
  useEffect(() => {
    const scroller = root.current?.closest<HTMLElement>("[data-scroll-allow]");
    if (!scroller || total < 2) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const box = scroller.getBoundingClientRect();
      const middle = box.top + box.height / 2;
      let best = 1;
      let bestDistance = Infinity;
      for (const el of scroller.querySelectorAll<HTMLElement>(
        "[data-viewer-page]",
      )) {
        const rect = el.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - middle);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = Number(el.dataset.viewerPage);
        }
      }
      setPage(best);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    measure();
    return () => {
      cancelAnimationFrame(raf);
      scroller.removeEventListener("scroll", onScroll);
    };
  }, [root, total]);
  return page;
};

const shareOrDownload = async (file: ViewerFile, blob: Blob | null) => {
  if (blob) {
    const shared = new File([blob], file.name, {
      type: blob.type || file.contentType,
    });
    if (navigator.canShare?.({ files: [shared] })) {
      try {
        await navigator.share({ files: [shared], title: file.name });
      } catch {
        // AbortError when the share sheet is dismissed; nothing to report.
      }
      return;
    }
  }
  const link = document.createElement("a");
  link.href = file.url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
};

function ViewerBody({
  file,
  onLoaded,
}: {
  file: ViewerFile;
  onLoaded: (blob: Blob) => void;
}) {
  const { loaded, error } = useViewerDocument(file.url);
  const [container, width] = useElementWidth();
  const total = loaded?.kind === "pdf" ? loaded.sizes.length : 1;
  const page = usePageInView(container, total);

  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  });
  useEffect(() => {
    if (loaded) onLoadedRef.current(loaded.blob);
  }, [loaded]);

  return (
    <div
      aria-label={file.name}
      className="flex min-h-full flex-col bg-tint px-2 pt-3 pb-2"
      ref={container}
      role="region"
    >
      {error ? (
        <p className="m-2 rounded-[14px] border-2 border-line bg-surface p-4 text-base text-subtle">
          {error} Try Open in browser below.
        </p>
      ) : !loaded ? (
        <div className="mx-auto flex aspect-[8.5/11] w-full max-w-[820px] animate-pulse items-center justify-center rounded-[4px] border-2 border-line bg-raised text-sm font-bold text-subtle">
          Loading document…
        </div>
      ) : loaded.kind === "pdf" ? (
        <div className="flex flex-col gap-3">
          {loaded.sizes.map((size, i) => (
            <PdfPage
              doc={loaded.doc}
              key={i}
              number={i + 1}
              size={size}
              total={loaded.sizes.length}
              width={Math.max(0, width - 16 - 4)}
            />
          ))}
        </div>
      ) : loaded.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element -- a blob URL of an access-checked file; next/image can't optimise it.
        <img
          alt=""
          className="mx-auto block h-auto w-full max-w-fit rounded-[4px] border-2 border-line bg-white"
          src={loaded.url}
        />
      ) : (
        <pre className="rounded-[4px] border-2 border-line bg-white p-4 font-mono text-sm whitespace-pre-wrap text-neutral-900 wrap-anywhere">
          {loaded.body}
        </pre>
      )}
      {total > 1 && (
        <p
          aria-hidden
          className="pointer-events-none sticky bottom-3 mx-auto mt-3 w-fit rounded-full border-2 border-line bg-surface px-3 py-1 text-sm font-bold text-ink tabular-nums"
        >
          Page {page} of {total}
        </p>
      )}
    </div>
  );
}

const barButton =
  "press-flat grid size-11 shrink-0 place-items-center rounded-[10px] text-ink";

const footButton =
  "press-flat flex min-h-11 items-center justify-center gap-2 rounded-[10px] border-2 border-[var(--line-strong)] px-3 text-base font-bold whitespace-nowrap text-ink";

/**
 * A full-screen <dialog> over everything on phones. Open it from the page's
 * stack param (`open={view.value != null}`) and end every exit in
 * `view.close()`.
 */
export function DocumentViewer({
  file,
  open,
  onClose,
}: {
  file: ViewerFile | null;
  open: boolean;
  onClose: () => void;
}) {
  // Kept through the exit animation after the page resolves null.
  const [shown, setShown] = useState(file);
  if (file && file !== shown && file.url !== shown?.url) setShown(file);
  const blobRef = useRef<Blob | null>(null);
  const [blobFor, setBlobFor] = useState<string | null>(null);

  if (!shown) return null;
  const ready = blobFor === shown.url;

  return (
    <Sheet
      desktop="none"
      footer={
        <div className="grid grid-cols-2 gap-3">
          <a className={footButton} download={shown.name} href={shown.url}>
            <Download aria-hidden className="size-5" />
            Download
          </a>
          <a
            aria-label="Open in browser"
            className={footButton}
            href={shown.url}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink aria-hidden className="size-5" />
            <span>
              Open<span className="max-[400px]:hidden"> in browser</span>
            </span>
          </a>
        </div>
      }
      initialFocus="title"
      onClose={() => onClose()}
      open={open}
      presentation="full"
      // The sheet's own centred title column grows to the filename's full
      // width, so the visible title is drawn here, truncated, between the
      // two buttons; the real heading stays for screen readers.
      hideTitle
      title={shown.name}
      topBar={{
        leading: (
          <>
            <button
              aria-label="Close"
              className={barButton}
              onClick={() => onClose()}
              type="button"
            >
              <X aria-hidden className="size-5" strokeWidth={2.5} />
            </button>
            <p
              aria-hidden
              className="min-w-0 flex-1 truncate px-1 text-center text-base font-extrabold text-ink"
            >
              {shown.name}
            </p>
          </>
        ),
        trailing: (
          <button
            aria-label={`Share ${shown.name}`}
            className={cn(barButton, !ready && "text-subtle")}
            onClick={() =>
              void shareOrDownload(shown, ready ? blobRef.current : null)
            }
            type="button"
          >
            <Share aria-hidden className="size-5" strokeWidth={2.25} />
          </button>
        ),
      }}
    >
      <ViewerBody
        file={shown}
        key={shown.url}
        onLoaded={(blob) => {
          blobRef.current = blob;
          setBlobFor(shown.url);
        }}
      />
    </Sheet>
  );
}
