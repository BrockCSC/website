"use client";

import Image from "next/image";
import { useRef } from "react";
import { Button } from "./button";

const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

const parsePosition = (position?: string) => {
  const [x, y] = (position ?? "50% 50%").split(" ").map((p) => parseFloat(p));
  return { x: Number.isFinite(x) ? x : 50, y: Number.isFinite(y) ? y : 50 };
};

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
        {/* Below sm the box fills the width at the cards' 4:5, so a thumb
            can aim; from sm it's the compact 128x160 it always was. */}
        <button
          aria-label="Choose what stays in frame"
          className="relative aspect-[4/5] w-full max-w-[20rem] shrink-0 touch-none cursor-crosshair select-none overflow-hidden rounded-[12px] border-2 border-line active:cursor-grabbing sm:h-40 sm:w-32"
          // A native image drag fires pointercancel and ends the pick mid-gesture.
          onDragStart={(e) => e.preventDefault()}
          onLostPointerCapture={() => {
            dragging.current = false;
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
          onPointerDown={(e) => {
            dragging.current = true;
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
            className="pointer-events-none object-cover"
            draggable={false}
            fill
            src={url}
            style={{ objectPosition: `${x}% ${y}%` }}
            unoptimized
          />
          <span
            aria-hidden
            className="pointer-events-none absolute size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-brand/70 shadow-[0_0_0_2px_rgba(0,0,0,0.6)] sm:size-5"
            style={{ left: `${x}%`, top: `${y}%` }}
          />
        </button>

        <div className="text-sm">
          <p className="font-semibold">Framing</p>
          <p className="mt-1 max-w-[22rem] text-subtle">
            Cards crop to a fixed shape.{" "}
            <span className="pointer-coarse:hidden">
              Click or drag on the photo to choose what stays in frame — for a
              portrait, aim at the face.
            </span>
            <span className="hidden pointer-coarse:inline">
              Drag on the photo to choose what stays in frame — for a portrait,
              aim at the face.
            </span>
            <span className="hidden pointer-fine:inline">
              {" "}
              Arrow keys nudge it.
            </span>
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span className="font-mono text-xs text-subtle">
              {x}% {y}%
            </span>
            {/* Touch gets a real button; a mouse keeps the small link. */}
            <button
              className="text-xs font-semibold underline pointer-coarse:hidden"
              onClick={() => onChange("50% 50%")}
              type="button"
            >
              Reset to centre
            </button>
            <Button
              className="hidden pointer-coarse:inline-flex"
              onClick={() => onChange("50% 50%")}
              size="sm"
              type="button"
              variant="secondary"
            >
              Reset
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
