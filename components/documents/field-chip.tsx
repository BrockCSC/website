"use client";

import { Calendar, PenLine, Trash2, Type, type LucideIcon } from "lucide-react";
import { useRef } from "react";
import type { SigningFieldType } from "@/lib/api/types";

const ICON: Record<SigningFieldType, LucideIcon> = {
  signature: PenLine,
  date: Calendar,
  text: Type,
};

const clamp = (n: number) => Math.min(100, Math.max(0, n));

/**
 * A placed field, draggable to reposition — mirrors the pointer-capture and
 * keyboard-nudge interaction of components/ui/image-focus.tsx, but as a chip
 * rather than a single dot, with its own delete affordance. Must be a
 * DocumentPreview `overlay` child so its own clicks/drags don't also drop a
 * new field on the surface beneath it (every handler here stops propagation).
 */
export function PlaceableField({
  type,
  xPercent,
  yPercent,
  caption,
  onMove,
  onDelete,
}: {
  type: SigningFieldType;
  xPercent: number;
  yPercent: number;
  caption: string;
  onMove: (xPercent: number, yPercent: number) => void;
  onDelete: () => void;
}) {
  const dragging = useRef(false);
  const Icon = ICON[type];

  return (
    <div
      aria-label={`${caption} field. Drag to move, arrow keys to nudge, Delete to remove.`}
      className="pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center gap-1 rounded-[10px] border-2 border-line bg-brand px-2 py-1 text-xs font-bold whitespace-nowrap text-brand-ink shadow-brut-sm select-none active:cursor-grabbing"
      onClick={(e) => e.stopPropagation()}
      onDragStart={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 5 : 1;
        if (e.key === "ArrowUp") onMove(xPercent, clamp(yPercent - step));
        else if (e.key === "ArrowDown")
          onMove(xPercent, clamp(yPercent + step));
        else if (e.key === "ArrowLeft")
          onMove(clamp(xPercent - step), yPercent);
        else if (e.key === "ArrowRight")
          onMove(clamp(xPercent + step), yPercent);
        else if (["Escape", "Backspace", "Delete"].includes(e.key)) onDelete();
        else return;
        e.preventDefault();
        e.stopPropagation();
      }}
      onLostPointerCapture={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        const container = e.currentTarget.parentElement;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        onMove(
          clamp(((e.clientX - rect.left) / rect.width) * 100),
          clamp(((e.clientY - rect.top) / rect.height) * 100),
        );
      }}
      onPointerUp={(e) => {
        dragging.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      role="button"
      style={{ left: `${xPercent}%`, top: `${yPercent}%` }}
      tabIndex={0}
      title={`${caption} — drag to move, Delete to remove`}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {caption}
      <button
        aria-label={`Delete ${caption} field`}
        className="ml-1 rounded-full p-0.5 hover:bg-black/10"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        type="button"
      >
        <Trash2 aria-hidden className="size-3" />
      </button>
    </div>
  );
}
