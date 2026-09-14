"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  LETTERHEAD_PAGE_MIN_HEIGHT,
  LETTERHEAD_PAGE_WIDTH,
} from "@/lib/documents/page-size";
import { PageBox } from "./page-box";

type Kind = "pdf" | "image" | "html" | "text" | "unsupported";

const kindForContentType = (contentType: string): Kind => {
  if (contentType === "application/pdf") return "pdf";
  if (contentType === "image/png" || contentType === "image/jpeg")
    return "image";
  if (contentType === "text/html") return "html";
  if (contentType === "text/plain") return "text";
  return "unsupported";
};

/**
 * Renders a document version (PDF via pdfjs-dist, an image directly, or an
 * HTML-origin document inline) as a fixed-size page that percentage-based
 * fields can be positioned on top of. Paging only for multi-page PDFs — no
 * zoom, search or annotation beyond that, per the brief.
 *
 * The HTML case is rendered inline (sanitized at write time — see
 * lib/documents/letterhead.ts) rather than in a sandboxed iframe: an iframe's
 * content is a separate browsing context, so clicks inside it never reach
 * this component's click-to-place handler. Every consumer here is already an
 * authenticated exec, an approver, or a token-scoped signer who could open
 * the exact same file directly (documentFileUrl / signerFileUrl) with no
 * sandbox at all, so this doesn't lower the existing trust boundary.
 *
 * Pass `key={fileUrl}` from the caller when the URL can change under a
 * mounted instance (e.g. picking a different version) — internal state
 * resets by remounting rather than by an effect clearing it on every render.
 */
export function DocumentPreview({
  fileUrl,
  contentType,
  placing = false,
  onPlace,
  overlay,
}: {
  fileUrl: string;
  contentType: string;
  /** True while a field type + signer are both chosen, arming click-to-place. */
  placing?: boolean;
  onPlace?: (page: number, xPercent: number, yPercent: number) => void;
  /** Absolutely-covers the page; position your own children by percent (left/top). Both this and onPlace already receive the current page — no separate page-tracking prop needed. */
  overlay?: (page: number) => React.ReactNode;
}) {
  const kind = kindForContentType(contentType);
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [pageSize, setPageSize] = useState({
    width: LETTERHEAD_PAGE_WIDTH,
    height: LETTERHEAD_PAGE_MIN_HEIGHT,
  });
  const [htmlText, setHtmlText] = useState<string | null>(null);
  const [textBody, setTextBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<
    import("pdfjs-dist").PDFDocumentProxy | null
  >(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (kind === "html" || kind === "text") {
      let cancelled = false;
      fetch(fileUrl, { credentials: "same-origin" })
        .then((res) => {
          if (!res.ok) throw new Error("fetch failed");
          return res.text();
        })
        .then((text) => {
          if (cancelled) return;
          if (kind === "html") setHtmlText(text);
          else setTextBody(text);
        })
        .catch(() => {
          if (!cancelled) setError("Could not load this document.");
        });
      return () => {
        cancelled = true;
      };
    }

    if (kind === "pdf") {
      let cancelled = false;
      let loadingTask: import("pdfjs-dist").PDFDocumentLoadingTask | undefined;
      void (async () => {
        try {
          const pdfjs = await import("pdfjs-dist");
          pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/build/pdf.worker.min.mjs",
            import.meta.url,
          ).toString();
          const res = await fetch(fileUrl, { credentials: "same-origin" });
          if (!res.ok) throw new Error("fetch failed");
          const data = await res.arrayBuffer();
          if (cancelled) return;
          loadingTask = pdfjs.getDocument({ data });
          const doc = await loadingTask.promise;
          if (cancelled) return;
          setNumPages(doc.numPages);
          setPdfDoc(doc);
        } catch {
          if (!cancelled) setError("Could not load this PDF.");
        }
      })();
      return () => {
        cancelled = true;
        void loadingTask?.destroy();
      };
    }
    // image/unsupported need no fetch: <img> loads fileUrl directly.
  }, [kind, fileUrl]);

  // Renders the current PDF page onto the canvas, cancelling any in-flight
  // render before starting the next — StrictMode double-effects and fast
  // page-flipping both otherwise race two renders on one canvas.
  useEffect(() => {
    if (kind !== "pdf" || !pdfDoc) return;
    let cancelled = false;
    let renderTask: import("pdfjs-dist").RenderTask | undefined;
    void (async () => {
      const pdfPage = await pdfDoc.getPage(page);
      if (cancelled) return;
      const viewport = pdfPage.getViewport({ scale: 1 });
      setPageSize({ width: viewport.width, height: viewport.height });
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      renderTask = pdfPage.render({ canvasContext: ctx, viewport });
      try {
        await renderTask.promise;
      } catch {
        // cancel() rejects the promise by design — nothing to report.
      }
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [kind, pdfDoc, page]);

  useEffect(
    () => () => {
      void pdfDoc?.destroy();
    },
    [pdfDoc],
  );

  const handleSurfaceClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!placing || !onPlace) return;
    // A child field chip that didn't stop propagation shouldn't also drop a new field.
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((e.clientY - rect.top) / rect.height) * 100;
    onPlace(
      page,
      Math.min(100, Math.max(0, xPercent)),
      Math.min(100, Math.max(0, yPercent)),
    );
  };

  if (error) {
    return (
      <p className="rounded-[14px] border-2 border-line bg-tint p-4 text-sm text-subtle">
        {error}
      </p>
    );
  }

  if (kind === "unsupported") {
    return (
      <p className="rounded-[14px] border-2 border-line bg-tint p-4 text-sm text-subtle">
        Preview isn&apos;t available for this file type.
      </p>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-[14px] border-2 border-line bg-tint p-3">
        <PageBox height={pageSize.height} width={pageSize.width}>
          <div
            className="relative bg-white"
            style={{ width: pageSize.width, height: pageSize.height }}
          >
            {kind === "pdf" && <canvas ref={canvasRef} />}
            {kind === "image" && (
              // eslint-disable-next-line @next/next/no-img-element -- dynamic, unsized authenticated/token-scoped file; next/image can't optimize it.
              <img
                alt=""
                onLoad={(e) => {
                  const img = e.currentTarget;
                  setPageSize({
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                  });
                }}
                src={fileUrl}
                style={{
                  display: "block",
                  height: pageSize.height,
                  width: pageSize.width,
                }}
              />
            )}
            {kind === "html" &&
              (htmlText !== null ? (
                <div
                  className="size-full overflow-hidden"
                  // Sanitized server-side at write time (lib/documents/letterhead.ts /
                  // lib/mail/sanitize.ts) — see the file-level comment above.
                  dangerouslySetInnerHTML={{ __html: htmlText }}
                />
              ) : (
                <p className="p-4 text-sm text-subtle">Loading...</p>
              ))}
            {kind === "text" &&
              (textBody !== null ? (
                <pre className="size-full overflow-auto whitespace-pre-wrap p-6 font-mono text-xs text-ink">
                  {textBody}
                </pre>
              ) : (
                <p className="p-4 text-sm text-subtle">Loading...</p>
              ))}

            <div
              className="absolute inset-0"
              onClick={handleSurfaceClick}
              style={{ cursor: placing ? "crosshair" : "default" }}
            >
              {overlay?.(page)}
            </div>
          </div>
        </PageBox>
      </div>

      {numPages > 1 && (
        <div className="mt-2 flex items-center justify-center gap-3">
          <Button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            size="xs"
            type="button"
            variant="outline"
          >
            Previous
          </Button>
          <span className="text-xs font-bold text-subtle">
            Page {page} of {numPages}
          </span>
          <Button
            disabled={page >= numPages}
            onClick={() => setPage(page + 1)}
            size="xs"
            type="button"
            variant="outline"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
