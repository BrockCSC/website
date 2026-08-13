"use client";

import Image from "next/image";
import { useRef } from "react";

const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

export const parsePosition = (position?: string) => {
  const [x, y] = (position ?? "50% 50%").split(" ").map((p) => parseFloat(p));
  return { x: Number.isFinite(x) ? x : 50, y: Number.isFinite(y) ? y : 50 };
};

/**
 * Cards crop with object-cover, which cuts heads off centred portraits.
 * Click or drag to pick the point that stays in frame.
 */
export function ImageFocus({
  url,
  position,
  onChange,
}: {
  url: string;
  position?: string;
  onChange: (position: string) => void;
}) {
  const box = useRef<HTMLButtonElement>(null);
  const dragging = useRef(false);
  const { x, y } = parsePosition(position);

  const pick = (clientX: number, clientY: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    onChange(
      `${clamp(((clientX - rect.left) / rect.width) * 100)}% ${clamp(
        ((clientY - rect.top) / rect.height) * 100,
      )}%`,
    );
  };

  const nudge = (dx: number, dy: number) =>
    onChange(`${clamp(x + dx)}% ${clamp(y + dy)}%`);

  return (
    <div>
      <div className="flex flex-wrap items-start gap-4">
        <button
          className="relative h-40 w-32 shrink-0 touch-none cursor-crosshair overflow-hidden rounded-[12px] border-2 border-black active:cursor-grabbing"
          onLostPointerCapture={() => {
            dragging.current = false;
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
          onPointerDown={(e) => {
            dragging.current = true;
            // Capture so the drag keeps tracking outside the thumbnail.
            e.currentTarget.setPointerCapture(e.pointerId);
            pick(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (dragging.current) pick(e.clientX, e.clientY);
          }}
          onPointerUp={(e) => {
            dragging.current = false;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 10 : 2;
            if (e.key === "ArrowUp") nudge(0, -step);
            else if (e.key === "ArrowDown") nudge(0, step);
            else if (e.key === "ArrowLeft") nudge(-step, 0);
            else if (e.key === "ArrowRight") nudge(step, 0);
            else return;
            e.preventDefault();
          }}
          ref={box}
          title="Click or drag to choose what stays in frame"
          type="button"
        >
          <Image
            alt=""
            className="object-cover"
            fill
            src={url}
            style={{ objectPosition: `${x}% ${y}%` }}
            unoptimized
          />
          <span
            aria-hidden
            className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#9A4440]/70 shadow-[0_0_0_2px_rgba(0,0,0,0.6)]"
            style={{ left: `${x}%`, top: `${y}%` }}
          />
        </button>

        <div className="text-sm">
          <p className="font-semibold">Framing</p>
          <p className="mt-1 max-w-[22rem] text-neutral-500">
            Cards crop to a fixed shape. Click or drag on the photo to choose
            what stays in frame — for a portrait, aim at the face. Arrow keys
            nudge it.
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span className="font-mono text-xs text-neutral-500">
              {x}% {y}%
            </span>
            <button
              className="text-xs font-semibold underline"
              onClick={() => onChange("50% 50%")}
              type="button"
            >
              Reset to centre
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
