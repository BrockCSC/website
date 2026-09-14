"use client";

import { ArrowRight, ChevronDown, Check } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type MenuItem = { label: string; onSelect: () => void; destructive?: boolean };

function OtherActionsMenu({
  items,
  disabled,
}: {
  items: MenuItem[];
  disabled: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !menu.current?.contains(target) &&
        !trigger.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  return (
    <div className="relative">
      <Button
        aria-controls={id}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        ref={trigger}
        size="sm"
        type="button"
        variant="outline"
      >
        <span className="hidden sm:inline">Other actions</span>
        <span className="sm:hidden">More</span>
        <ChevronDown aria-hidden />
      </Button>
      {open && (
        <div
          className="absolute right-0 z-40 mt-2 w-52 animate-pop-in overflow-hidden rounded-[14px] border-2 border-line bg-surface py-1 shadow-brut"
          id={id}
          onKeyDown={(e) => {
            const nodes = Array.from(
              menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ??
                [],
            );
            const index = nodes.indexOf(document.activeElement as HTMLElement);
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              close(true);
            } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const step = e.key === "ArrowDown" ? 1 : -1;
              nodes[(index + step + nodes.length) % nodes.length]?.focus();
            } else if (e.key === "Tab") {
              close(false);
            }
          }}
          ref={menu}
          role="menu"
        >
          {items.map((item) => (
            <button
              className={`block w-full px-4 py-2 text-left text-sm font-bold hover:bg-tint focus:bg-tint ${
                item.destructive ? "text-destructive" : "text-ink"
              }`}
              key={item.label}
              onClick={() => {
                close(false);
                item.onSelect();
              }}
              role="menuitem"
              tabIndex={-1}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ActionBar({
  done,
  total,
  started,
  busy,
  error,
  menuItems,
  onNext,
  onFinish,
}: {
  done: number;
  total: number;
  started: boolean;
  busy: boolean;
  error: string | null;
  menuItems: MenuItem[];
  onNext: () => void;
  onFinish: () => void;
}) {
  const complete = done >= total;
  const percent = total ? Math.round((done / total) * 100) : 100;

  return (
    <div className="sticky top-0 z-30 -mx-1 border-b-2 border-line bg-surface/95 px-1 py-3 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-40">
          <p aria-live="polite" className="text-sm font-bold text-ink">
            {total ? (
              <>
                {done} of {total} required field{total === 1 ? "" : "s"}
              </>
            ) : (
              "Review the document, then finish"
            )}
          </p>
          <div
            aria-hidden
            className="mt-1.5 h-2 w-full max-w-60 overflow-hidden rounded-full border-2 border-line bg-raised"
          >
            <div
              className="h-full bg-brand transition-[width] duration-[var(--dur)]"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <OtherActionsMenu disabled={busy} items={menuItems} />
          {!complete && (
            <Button
              disabled={busy}
              onClick={onNext}
              size="sm"
              type="button"
              variant="secondary"
            >
              {started ? "Next" : "Start"}
              <ArrowRight aria-hidden />
            </Button>
          )}
          <Button
            disabled={!complete || busy}
            onClick={onFinish}
            size="sm"
            type="button"
          >
            <Check aria-hidden />
            {busy ? "Finishing..." : "Finish"}
          </Button>
        </div>
      </div>
      {error && (
        <p className="mt-2 text-sm font-bold text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
