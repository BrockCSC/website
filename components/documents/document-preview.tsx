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
 * HTML-origin document in a sandboxed iframe) as a fixed-size page that
 * percentage-based fields can be positioned on top of. Paging only for
 * multi-page PDFs — no zoom, search or annotation beyond that, per the brief.
 *
 * The HTML case stays in `<iframe sandbox srcDoc>` rather than
 * `dangerouslySetInnerHTML`: write-time sanitizing (lib/documents/letterhead.ts)
 * is the only guard for injected markup, but the stored document also carries
 * its own `<meta>` CSP that only takes effect when it's actually parsed as a
 * standalone document — inlined via innerHTML, `<head>` is dropped and that
 * CSP never applies. Click-to-place still works: the overlay below is a
 * parent-document layer stacked *above* the iframe, not something living
 * inside it, so it never needs the iframe's own clicks to bubble anywhere.
 *
 * `sandbox="allow-same-origin"` (never paired with `allow-scripts`, which
 * this deliberately omits) — without it, srcDoc gives the frame a unique
 * opaque origin and `contentDocument` from the parent reads back `null`,
 * which is what we need to measure real content height for a long letterhead
 * document (below). Granting same-origin without scripts costs nothing here:
 * the letterhead's CSP has no `script-src`, so scripts stay inert either way,
 * and every other capability same-origin unlocks (document.cookie, storage,
 * form submission) needs a script to use.
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
  const preRef = useRef<HTMLPreElement>(null);

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
      // 1 PDF point -> 1 CSS px at 96dpi, the usual baseline before any
      // further zoom (there is none here) — renders a Letter page at ~816px
      // instead of pdfjs's native 612pt, matching the letterhead page width.
      const viewport = pdfPage.getViewport({ scale: 96 / 72 });
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

  // Plain-text content (the completion certificate, mainly) has no fixed page
  // size of its own — grow the box to fit it, the same way the pdf/image
  // effects above size to their real content, instead of leaving it clipped
  // at the default page height.
  useEffect(() => {
    if (kind !== "text" || textBody === null) return;
    const el = preRef.current;
    if (!el) return;
    setPageSize({
      width: LETTERHEAD_PAGE_WIDTH,
      height: Math.max(LETTERHEAD_PAGE_MIN_HEIGHT, el.scrollHeight),
    });
  }, [kind, textBody]);

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
                <iframe
                  className="size-full border-0"
                  onLoad={(e) => {
                    // Same-origin (no scripts) so the parent can read the
                    // framed document's real height — see the docblock above.
                    const measured =
                      e.currentTarget.contentDocument?.documentElement
                        .scrollHeight;
                    if (measured) {
                      setPageSize({
                        width: LETTERHEAD_PAGE_WIDTH,
                        height: Math.max(LETTERHEAD_PAGE_MIN_HEIGHT, measured),
                      });
                    }
                  }}
                  sandbox="allow-same-origin"
                  srcDoc={htmlText}
                  title="Document preview"
                />
              ) : (
                <p className="p-4 text-sm text-subtle">Loading...</p>
              ))}
            {kind === "text" &&
              (textBody !== null ? (
                <pre
                  className="size-full overflow-auto whitespace-pre-wrap p-6 font-mono text-xs text-ink"
                  ref={preRef}
                >
                  {textBody}
                </pre>
              ) : (
                <p className="p-4 text-sm text-subtle">Loading...</p>
              ))}

            {/* pointer-events off except while actively placing a field: a
                sibling of the iframe/pre above, so left on it would swallow
                their own scrollbar/wheel input for no reason the rest of the
                time. Field chips opt back in with pointer-events-auto. */}
            <div
              className="absolute inset-0"
              onClick={handleSurfaceClick}
              style={{
                cursor: placing ? "crosshair" : "default",
                pointerEvents: placing ? "auto" : "none",
              }}
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
