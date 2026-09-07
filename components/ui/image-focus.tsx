"use client";

import Image from "next/image";
import { useRef } from "react";

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
  /** Where the handle sat under the pointer when the drag began, in percent. */
  const grab = useRef({ x: 0, y: 0 });
  const { x, y } = parsePosition(position);

  const at = (clientX: number, clientY: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  };

  const move = (clientX: number, clientY: number) => {
    const point = at(clientX, clientY);
    if (!point) return;
    onChange(
      `${clamp(point.x + grab.current.x)}% ${clamp(point.y + grab.current.y)}%`,
    );
  };

  /** Grabbing the handle keeps it under the pointer; elsewhere it jumps there. */
  const start = (clientX: number, clientY: number) => {
    const point = at(clientX, clientY);
    const rect = box.current?.getBoundingClientRect();
    if (!point || !rect) return;
    const near =
      Math.abs(((point.x - x) / 100) * rect.width) < 16 &&
      Math.abs(((point.y - y) / 100) * rect.height) < 16;
    grab.current = near ? { x: x - point.x, y: y - point.y } : { x: 0, y: 0 };
    move(clientX, clientY);
  };

  const nudge = (dx: number, dy: number) =>
    onChange(`${clamp(x + dx)}% ${clamp(y + dy)}%`);

  return (
    <div>
      <div className="flex flex-wrap items-start gap-4">
        <button
          className="group relative h-40 w-32 shrink-0 touch-none cursor-grab overflow-hidden rounded-[12px] border-2 border-line active:cursor-grabbing"
          onLostPointerCapture={() => {
            dragging.current = false;
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
          onPointerDown={(e) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            start(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (dragging.current) move(e.clientX, e.clientY);
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
          title="Drag the dot, or press anywhere, to choose what stays in frame"
          type="button"
        >
          <Image
            alt=""
            className="object-cover"
            fill
            draggable={false}
            src={url}
            style={{ objectPosition: `${x}% ${y}%` }}
            unoptimized
          />
          <span
            aria-hidden
            className="pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-brand/70 shadow-[0_0_0_2px_rgba(0,0,0,0.6)] transition-transform duration-[var(--dur-fast)] ease-smooth group-active:scale-110"
            style={{ left: `${x}%`, top: `${y}%` }}
          />
        </button>

        <div className="text-sm">
          <p className="font-semibold">Framing</p>
          <p className="mt-1 max-w-[22rem] text-subtle">
            Cards crop to a fixed shape. Drag the dot to choose what stays in
            frame — for a portrait, aim at the face. Pressing elsewhere moves it
            there, and arrow keys nudge it.
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span className="font-mono text-xs text-subtle">
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
