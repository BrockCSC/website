"use client";

import { Eraser } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SIGNATURE_INK } from "./signature-fonts";

type Point = { x: number; y: number };

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
 * Freehand pad on pointer events, so mouse, pen and touch all draw. Strokes
 * are kept as points so a resize can redraw them, and each stroke is drawn
 * as quadratic curves through segment midpoints to smooth the polyline.
 */
export function SignaturePad({
  label,
  height,
  onChange,
}: {
  label: string;
  height: number;
  onChange: (png: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  const drawing = useRef<Point[] | null>(null);
  const onChangeRef = useRef(onChange);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const lineWidth = height > 120 ? 2.6 : 2.2;

  const drawStroke = (ctx: CanvasRenderingContext2D, points: Point[]) => {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    if (points.length === 1) {
      ctx.arc(points[0].x, points[0].y, lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = SIGNATURE_INK;
      ctx.fill();
      return;
    }
    for (let i = 1; i < points.length - 1; i++) {
      const mid = {
        x: (points[i].x + points[i + 1].x) / 2,
        y: (points[i].y + points[i + 1].y) / 2,
      };
      ctx.quadraticCurveTo(points[i].x, points[i].y, mid.x, mid.y);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  };

  const prepare = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return null;
    const ratio = window.devicePixelRatio || 1;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = SIGNATURE_INK;
    return { canvas, ctx };
  };

  const redraw = () => {
    const ready = prepare();
    if (!ready) return;
    const { canvas, ctx } = ready;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokes.current) drawStroke(ctx, stroke);
    if (drawing.current) drawStroke(ctx, drawing.current);
  };
  const redrawRef = useRef(redraw);
  useEffect(() => {
    redrawRef.current = redraw;
  });

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
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const finish = () => {
    if (!drawing.current) return;
    strokes.current.push(drawing.current);
    drawing.current = null;
    redraw();
    setEmpty(false);
    const canvas = canvasRef.current;
    onChangeRef.current(canvas ? exportTrimmed(canvas) : null);
  };

  const clear = () => {
    strokes.current = [];
    drawing.current = null;
    redraw();
    setEmpty(true);
    onChangeRef.current(null);
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-ink">{label}</span>
        <button
          className="inline-flex items-center gap-1 rounded-[10px] border-2 border-line px-2 py-0.5 text-xs font-bold text-ink hover:bg-tint disabled:opacity-50"
          disabled={empty}
          onClick={clear}
          type="button"
        >
          <Eraser aria-hidden className="size-3.5" />
          Clear
        </button>
      </div>
      <div
        className="relative overflow-hidden rounded-[12px] border-2 border-line bg-white"
        style={{ height }}
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
      </div>
    </div>
  );
}
