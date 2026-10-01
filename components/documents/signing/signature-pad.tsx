"use client";

import { Eraser } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { SIGNATURE_INK } from "./signature-fonts";

type Point = { x: number; y: number };

/** One stroke, each point normalised to 0–1 of the pad, so a resize or rotation rescales it. */
export type Stroke = Point[];

const MAX_EXPORT_WIDTH = 1000;
const MAX_EXPORT_BYTES = 280_000;
const PADDING = 6;

/** Crops to the ink, keeps the background transparent, and caps the width so the PNG stays small. */
const exportTrimmed = (canvas: HTMLCanvasElement): string | null => {
  const ctx = canvas.getContext("2d");
  if (!ctx || !canvas.width || !canvas.height) return null;
  const { data, width, height } = ctx.getImageData(
    0,
    0,
    canvas.width,
    canvas.height,
  );
  let top = height;
  let left = width;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return null;
  const pad = PADDING * (window.devicePixelRatio || 1);
  left = Math.max(0, left - pad);
  top = Math.max(0, top - pad);
  right = Math.min(width - 1, right + pad);
  bottom = Math.min(height - 1, bottom + pad);
  const cropWidth = right - left + 1;
  const cropHeight = bottom - top + 1;
  let ratio = Math.min(1, MAX_EXPORT_WIDTH / cropWidth);
  for (;;) {
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(cropWidth * ratio));
    out.height = Math.max(1, Math.round(cropHeight * ratio));
    const outCtx = out.getContext("2d");
    if (!outCtx) return null;
    outCtx.imageSmoothingQuality = "high";
    outCtx.drawImage(
      canvas,
      left,
      top,
      cropWidth,
      cropHeight,
      0,
      0,
      out.width,
      out.height,
    );
    const png = out.toDataURL("image/png");
    // The server refuses anything over 300KB decoded; dense scribbles can get there.
    if ((png.length * 3) / 4 <= MAX_EXPORT_BYTES || out.width < 120) return png;
    ratio *= 0.7;
  }
};

/**
 * The drawing surface on its own: a canvas on pointer events, so mouse, pen
 * and touch all draw. Strokes are controlled by the parent (kept normalised,
 * so they survive closing and re-opening the pad), and each is drawn as
 * quadratic curves through segment midpoints to smooth the polyline. After a
 * change it exports the trimmed PNG through onPng.
 */
export function PadCanvas({
  label,
  strokes,
  onStrokesChange,
  onPng,
  lineWidth = 2.6,
}: {
  label: string;
  strokes: Stroke[];
  onStrokesChange: (strokes: Stroke[]) => void;
  onPng: (png: string | null) => void;
  lineWidth?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<Stroke | null>(null);
  // The strokes the last exported PNG was made from.
  const exported = useRef<Stroke[] | null>(null);
  const latest = useRef({ strokes, onStrokesChange, onPng, lineWidth });
  useLayoutEffect(() => {
    latest.current = { strokes, onStrokesChange, onPng, lineWidth };
  });

  const size = () => {
    const canvas = canvasRef.current;
    const ratio = window.devicePixelRatio || 1;
    return canvas
      ? { w: canvas.width / ratio, h: canvas.height / ratio }
      : { w: 0, h: 0 };
  };

  const drawStroke = (ctx: CanvasRenderingContext2D, points: Stroke) => {
    if (!points.length) return;
    const { w, h } = size();
    const at = (p: Point) => ({ x: p.x * w, y: p.y * h });
    const width = latest.current.lineWidth;
    const first = at(points[0]);
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    if (points.length === 1) {
      ctx.arc(first.x, first.y, width / 2, 0, Math.PI * 2);
      ctx.fillStyle = SIGNATURE_INK;
      ctx.fill();
      return;
    }
    for (let i = 1; i < points.length - 1; i++) {
      const p = at(points[i]);
      const q = at(points[i + 1]);
      ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
    }
    const last = at(points[points.length - 1]);
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  };

  /** Redraws, then exports once per new set of strokes (never from a 0-size canvas). */
  const redraw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = latest.current.lineWidth;
    ctx.strokeStyle = SIGNATURE_INK;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const current = latest.current.strokes;
    for (const stroke of current) drawStroke(ctx, stroke);
    if (drawing.current) drawStroke(ctx, drawing.current);
    if (drawing.current || !canvas.width || exported.current === current) {
      return;
    }
    exported.current = current;
    latest.current.onPng(current.length ? exportTrimmed(canvas) : null);
  };
  const redrawRef = useRef(redraw);
  useLayoutEffect(() => {
    redrawRef.current = redraw;
  });

  useEffect(() => {
    redrawRef.current();
  }, [strokes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(entry.contentRect.width * ratio);
      canvas.height = Math.round(entry.contentRect.height * ratio);
      redrawRef.current();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const pointFrom = (event: PointerEvent | React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / (rect.width || 1),
      y: (event.clientY - rect.top) / (rect.height || 1),
    };
  };

  const finish = () => {
    const stroke = drawing.current;
    if (!stroke) return;
    drawing.current = null;
    latest.current.onStrokesChange([...latest.current.strokes, stroke]);
  };

  return (
    <canvas
      aria-label={`${label}. Draw with a mouse, pen or finger. Use Choose style if you can't draw.`}
      className="absolute inset-0 size-full cursor-crosshair touch-none"
      onLostPointerCapture={finish}
      onPointerCancel={finish}
      onPointerDown={(event) => {
        if (event.button !== 0 && event.pointerType === "mouse") return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drawing.current = [pointFrom(event)];
        redraw();
      }}
      onPointerMove={(event) => {
        if (!drawing.current) return;
        const native = event.nativeEvent;
        const events = native.getCoalescedEvents?.() ?? [native];
        for (const e of events.length ? events : [native]) {
          drawing.current.push(pointFrom(e));
        }
        redraw();
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        finish();
      }}
      ref={canvasRef}
      role="img"
    />
  );
}

/** The paper behind a pad: white, a dashed baseline and a hint while empty. */
export function PadPaper({
  empty,
  className,
  style,
  children,
}: {
  empty: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[12px] border-2 border-line bg-white select-none [-webkit-touch-callout:none]",
        className,
      )}
      style={style}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute right-4 bottom-[28%] left-4 border-b-2 border-dashed border-neutral-300"
      />
      {empty && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-3 text-center text-xs font-semibold text-neutral-400"
        >
          Draw here
        </span>
      )}
      {children}
    </div>
  );
}

/** Inline pad with its label and Clear (fine pointers). */
export function SignaturePad({
  label,
  height,
  strokes,
  onStrokesChange,
  onChange,
}: {
  label: string;
  height: number;
  strokes: Stroke[];
  onStrokesChange: (strokes: Stroke[]) => void;
  onChange: (png: string | null) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-ink">{label}</span>
        <button
          className="inline-flex items-center gap-1 rounded-[10px] border-2 border-line px-2 py-0.5 text-xs font-bold text-ink hover:bg-tint disabled:opacity-50 pointer-coarse:min-h-11 pointer-coarse:px-3"
          disabled={!strokes.length}
          onClick={() => onStrokesChange([])}
          type="button"
        >
          <Eraser aria-hidden className="size-3.5" />
          Clear
        </button>
      </div>
      <PadPaper empty={!strokes.length} style={{ height }}>
        <PadCanvas
          label={label}
          lineWidth={height > 120 ? 2.6 : 2.2}
          onPng={onChange}
          onStrokesChange={onStrokesChange}
          strokes={strokes}
        />
      </PadPaper>
    </div>
  );
}
