"use client";

import { FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist";
import { documentFileUrl } from "@/lib/api/documents";
import { loadPdfjs } from "@/lib/documents/load-pdfjs";

const BOX_WIDTH = 64;
const BOX_HEIGHT = 84;
const MAX_RENDERS = 2;

/** CSS size excludes the canvas's 1px border. */
type Rendered = { bitmap: HTMLCanvasElement; width: number; height: number };

/** null means show the file icon: not a PDF, or it could not be drawn. */
const renderedVersions = new Map<string, Rendered | null>();

let rendersRunning = 0;
const waiting: (() => void)[] = [];

const takeSlot = (signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    if (rendersRunning < MAX_RENDERS) {
      rendersRunning++;
      resolve();
      return;
    }
    const start = () => {
      signal.removeEventListener("abort", giveUp);
      resolve();
    };
    const giveUp = () => {
      waiting.splice(waiting.indexOf(start), 1);
      reject(signal.reason);
    };
    waiting.push(start);
    signal.addEventListener("abort", giveUp, { once: true });
  });

const releaseSlot = () => {
  const next = waiting.shift();
  if (next) next();
  else rendersRunning--;
};

const renderFirstPage = async (
  versionId: string,
  signal: AbortSignal,
): Promise<Rendered | null> => {
  await takeSlot(signal);
  let loadingTask: PDFDocumentLoadingTask | undefined;
  let renderTask: RenderTask | undefined;
  const stop = () => {
    renderTask?.cancel();
    void loadingTask?.destroy();
  };
  signal.addEventListener("abort", stop);
  try {
    const res = await fetch(documentFileUrl(versionId), {
      credentials: "same-origin",
      signal,
    });
    if (!res.ok) throw new Error("fetch failed");
    if (!res.headers.get("content-type")?.startsWith("application/pdf")) {
      await res.body?.cancel();
      return null;
    }
    const data = await res.arrayBuffer();
    const pdfjs = await loadPdfjs();
    signal.throwIfAborted();
    loadingTask = pdfjs.getDocument({ data });
    const doc = await loadingTask.promise;
    const page = await doc.getPage(1);
    signal.throwIfAborted();

    const natural = page.getViewport({ scale: 1 });
    const fit = Math.min(
      (BOX_WIDTH - 2) / natural.width,
      (BOX_HEIGHT - 2) / natural.height,
    );
    const width = Math.round(natural.width * fit);
    const height = Math.round(natural.height * fit);
    const ratio = window.devicePixelRatio || 1;
    const bitmap = document.createElement("canvas");
    bitmap.width = Math.round(width * ratio);
    bitmap.height = Math.round(height * ratio);
    const ctx = bitmap.getContext("2d");
    if (!ctx) return null;
    renderTask = page.render({
      canvasContext: ctx,
      viewport: page.getViewport({ scale: bitmap.width / natural.width }),
    });
    await renderTask.promise;
    return { bitmap, width, height };
  } finally {
    signal.removeEventListener("abort", stop);
    void loadingTask?.destroy();
    releaseSlot();
  }
};

const renderOnce = async (versionId: string, signal: AbortSignal) => {
  const cached = renderedVersions.get(versionId);
  if (cached !== undefined) return cached;
  try {
    const result = await renderFirstPage(versionId, signal);
    renderedVersions.set(versionId, result);
    return result;
  } catch (err) {
    if (signal.aborted) throw err;
    renderedVersions.set(versionId, null);
    return null;
  }
};

function Thumbnail({ versionId }: { versionId: string | null }) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(() =>
    versionId ? renderedVersions.get(versionId) : null,
  );

  useEffect(() => {
    const box = boxRef.current;
    if (!versionId || rendered !== undefined || !box) return;
    const controller = new AbortController();
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        renderOnce(versionId, controller.signal).then(setRendered, () => {});
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(box);
    return () => {
      observer.disconnect();
      controller.abort();
    };
  }, [versionId, rendered]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!rendered || !canvas) return;
    canvas.width = rendered.bitmap.width;
    canvas.height = rendered.bitmap.height;
    canvas.getContext("2d")?.drawImage(rendered.bitmap, 0, 0);
  }, [rendered]);

  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center"
      ref={boxRef}
      style={{ width: BOX_WIDTH, height: BOX_HEIGHT }}
    >
      {rendered ? (
        <canvas
          className="box-content block rounded-[2px] border border-line bg-white shadow-[2px_2px_0_0_var(--shade)]"
          ref={canvasRef}
          style={{ width: rendered.width, height: rendered.height }}
        />
      ) : (
        <span
          className={`flex size-full items-center justify-center rounded-[6px] bg-raised ${
            rendered === undefined ? "animate-pulse" : ""
          }`}
        >
          {rendered === null && (
            <FileText className="size-7 text-subtle" strokeWidth={1.75} />
          )}
        </span>
      )}
    </span>
  );
}

export function DocumentThumbnail({ versionId }: { versionId: string | null }) {
  return <Thumbnail key={versionId} versionId={versionId} />;
}
