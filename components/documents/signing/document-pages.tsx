"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

type Size = { width: number; height: number };

type Loaded =
  | { kind: "pdf"; doc: PDFDocumentProxy; sizes: Size[] }
  | { kind: "image"; url: string }
  | { kind: "text"; body: string };

/** Overlay children get the page number and how far the page is drawn below its 96dpi size. */
export type PageOverlay = (page: number, scale: number) => React.ReactNode;

const CSS_PX_PER_PT = 96 / 72;

const useDocument = (fileUrl: string) => {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let doc: PDFDocumentProxy | undefined;
    let objectUrl: string | undefined;
    void (async () => {
      try {
        const res = await fetch(fileUrl, { credentials: "same-origin" });
        if (!res.ok) throw new Error("fetch failed");
        const type = res.headers.get("content-type") ?? "";
        if (type.startsWith("image/")) {
          objectUrl = URL.createObjectURL(await res.blob());
          if (!cancelled) setLoaded({ kind: "image", url: objectUrl });
          return;
        }
        if (type.startsWith("text/plain")) {
          const body = await res.text();
          if (!cancelled) setLoaded({ kind: "text", body });
          return;
        }
        if (!type.startsWith("application/pdf")) {
          throw new Error("unsupported");
        }
        const data = await res.arrayBuffer();
        if (cancelled) return;
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const opened = await pdfjs.getDocument({ data }).promise;
        doc = opened;
        if (cancelled) return;
        const sizes = await Promise.all(
          Array.from({ length: opened.numPages }, async (_, i) => {
            const page = await opened.getPage(i + 1);
            const viewport = page.getViewport({ scale: CSS_PX_PER_PT });
            return { width: viewport.width, height: viewport.height };
          }),
        );
        if (!cancelled) setLoaded({ kind: "pdf", doc: opened, sizes });
      } catch {
        if (!cancelled) setError("Could not load this document.");
      }
    })();
    return () => {
      cancelled = true;
      void doc?.destroy();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileUrl]);

  return { loaded, error };
};

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

function PageFrame({
  number,
  total,
  maxWidth,
  children,
}: {
  number: number;
  total: number;
  /** Content width at 96dpi; a page is never drawn larger than that. */
  maxWidth?: number;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={`Page ${number} of ${total}`} className="w-full">
      <div
        className="mx-auto w-full overflow-hidden rounded-[6px] border-2 border-line bg-white shadow-brut-sm"
        style={maxWidth ? { maxWidth: maxWidth + 4 } : undefined}
      >
        {children}
      </div>
      {total > 1 && (
        <p className="mt-1.5 text-center text-[11px] font-bold text-subtle">
          {number} / {total}
        </p>
      )}
    </section>
  );
}

function PdfPage({
  doc,
  number,
  total,
  size,
  width,
  overlay,
}: {
  doc: PDFDocumentProxy;
  number: number;
  total: number;
  size: Size;
  /** Available content width, borders excluded. */
  width: number;
  overlay?: PageOverlay;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const shown = Math.min(width, size.width);
  // Re-rendering on every pixel of a resize thrashes the worker; the canvas stretches in between.
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
      // Far-away pages give their bitmap back, or a long document holds hundreds of MB.
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
    <PageFrame maxWidth={size.width} number={number} total={total}>
      <div
        className="relative w-full"
        ref={box}
        style={{ aspectRatio: `${size.width} / ${size.height}` }}
      >
        <p className="absolute inset-0 flex items-center justify-center text-xs font-bold text-neutral-400">
          Loading page {number}...
        </p>
        <canvas className="absolute inset-0 size-full" ref={canvas} />
        {overlay && shown > 0 && (
          <div className="pointer-events-none absolute inset-0">
            {overlay(number, shown / size.width)}
          </div>
        )}
      </div>
    </PageFrame>
  );
}

function ImagePage({ url, overlay }: { url: string; overlay?: PageOverlay }) {
  const [size, setSize] = useState<Size | null>(null);
  const [box, width] = useElementWidth();
  return (
    <PageFrame maxWidth={size?.width} number={1} total={1}>
      <div className="relative w-full" ref={box}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL of an access-checked file; next/image can't optimise it. */}
        <img
          alt=""
          className="block h-auto w-full"
          onLoad={(e) =>
            setSize({
              width: e.currentTarget.naturalWidth,
              height: e.currentTarget.naturalHeight,
            })
          }
          src={url}
        />
        {overlay && size && width > 0 && (
          <div className="pointer-events-none absolute inset-0">
            {overlay(1, width / size.width)}
          </div>
        )}
      </div>
    </PageFrame>
  );
}

/**
 * Every page of a document stacked for scrolling, drawn only while near the
 * viewport. Overlay children are placed by percent of the page, the same
 * coordinate space the preparer placed fields in (the pdfjs viewport, so
 * /Rotate and the crop box are already applied).
 */
export function DocumentPages({
  fileUrl,
  overlay,
  label,
}: {
  fileUrl: string;
  overlay?: PageOverlay;
  label: string;
}) {
  const { loaded, error } = useDocument(fileUrl);
  const [container, width] = useElementWidth();

  return (
    <div aria-label={label} className="w-full" ref={container} role="region">
      {error ? (
        <p className="rounded-[14px] border-2 border-line bg-tint p-4 text-sm text-subtle">
          {error}
        </p>
      ) : !loaded ? (
        <div className="mx-auto flex aspect-[8.5/11] w-full max-w-[820px] animate-pulse items-center justify-center rounded-[6px] border-2 border-line bg-raised text-sm font-bold text-subtle">
          Loading document...
        </div>
      ) : loaded.kind === "pdf" ? (
        <div className="flex flex-col gap-4">
          {loaded.sizes.map((size, i) => (
            <PdfPage
              doc={loaded.doc}
              key={i}
              number={i + 1}
              overlay={overlay}
              size={size}
              total={loaded.sizes.length}
              width={Math.max(0, width - 4)}
            />
          ))}
        </div>
      ) : loaded.kind === "image" ? (
        <ImagePage overlay={overlay} url={loaded.url} />
      ) : (
        <PageFrame maxWidth={816} number={1} total={1}>
          <pre className="overflow-x-auto p-6 font-mono text-xs whitespace-pre-wrap text-neutral-900">
            {loaded.body}
          </pre>
        </PageFrame>
      )}
    </div>
  );
}
