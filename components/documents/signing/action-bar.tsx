"use client";

import { ArrowRight, Check, ChevronDown, Ellipsis } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
          className="absolute left-0 z-40 mt-2 w-52 max-w-[calc(100vw-2rem)] animate-pop-in overflow-hidden rounded-[14px] border-2 border-line bg-surface py-1 shadow-brut sm:right-0 sm:left-auto"
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
              className={`block min-h-11 w-full px-4 py-2 text-left text-sm font-bold hover:bg-tint focus:bg-tint ${
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

/**
 * The sticky bar above the document: desk, tablets and the admin portal.
 * In the portal it sits under the admin's sticky phone header.
 */
export function ActionBar({
  done,
  total,
  started,
  busy,
  error,
  menuItems,
  onNext,
  onFinish,
  onBlockedFinish,
  portal,
  className,
}: {
  done: number;
  total: number;
  started: boolean;
  busy: boolean;
  error: string | null;
  menuItems: MenuItem[];
  onNext: () => void;
  onFinish: () => void;
  /** Finish while fields remain: say why and go to the next one. */
  onBlockedFinish: () => void;
  portal: boolean;
  className?: string;
}) {
  const progressId = useId();
  const complete = done >= total;
  const percent = total ? Math.round((done / total) * 100) : 100;

  return (
    <div
      className={cn(
        "sticky z-30 -mx-1 border-b-2 border-line bg-surface px-1 py-3",
        portal ? "top-[var(--admin-top)] desk:top-0" : "top-0",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-40">
          <p
            aria-live="polite"
            className="text-sm font-bold text-ink"
            id={progressId}
          >
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
            aria-describedby={complete ? undefined : progressId}
            aria-disabled={complete ? undefined : true}
            className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:translate-x-0 aria-disabled:hover:translate-y-0 aria-disabled:hover:shadow-brut-sm aria-disabled:active:translate-x-0 aria-disabled:active:translate-y-0 aria-disabled:active:shadow-brut-sm"
            disabled={busy}
            onClick={complete ? onFinish : onBlockedFinish}
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

const noop = () => () => {};
const useIsClient = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

/**
 * Public signing on phones: a fixed bar at the bottom, in thumb reach, with a
 * progress rail, "n of N", a More button and one primary whose label follows
 * the current field. Portaled to <body>. While it's mounted, html[data-sign-bar]
 * lifts toasts above it and turns off pull-to-refresh (globals.css). Its height
 * is 4.5rem plus the home-indicator inset, matching that rule.
 */
export function SignBottomBar({
  done,
  total,
  primaryLabel,
  loading,
  busy,
  onPrimary,
  onMore,
}: {
  done: number;
  total: number;
  primaryLabel: string;
  /** The document isn't laid out yet: a tap is queued. */
  loading: boolean;
  busy: boolean;
  onPrimary: () => void;
  onMore: () => void;
}) {
  const isClient = useIsClient();
  const percent = total ? Math.round((done / total) * 100) : 100;

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-sign-bar", "");
    return () => root.removeAttribute("data-sign-bar");
  }, []);

  if (!isClient) return null;

  return createPortal(
    <div
      aria-label="Signing"
      data-sign-bottom-bar
      className="chrome fixed inset-x-0 bottom-0 z-40 border-t-2 border-line bg-surface pr-[max(1rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]"
      role="region"
    >
      <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-raised">
        <div
          className="h-full bg-brand transition-[width] duration-[var(--dur)]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex h-[3.875rem] items-center gap-3 pt-3.5">
        <button
          aria-label="More options"
          className="press-flat grid size-11 shrink-0 place-items-center rounded-[10px] border-2 border-line text-ink disabled:opacity-50"
          disabled={busy}
          onClick={onMore}
          type="button"
        >
          <Ellipsis aria-hidden className="size-5" strokeWidth={2.5} />
        </button>
        <p
          aria-live="polite"
          className="shrink-0 text-sm font-bold whitespace-nowrap text-ink tabular-nums"
        >
          {total ? (
            <>
              {done} of {total}
              <span className="sr-only"> required fields done</span>
            </>
          ) : (
            "Review"
          )}
        </p>
        <Button
          aria-busy={loading || busy || undefined}
          className="h-12 min-w-0 flex-1 text-base"
          disabled={busy}
          onClick={onPrimary}
          type="button"
        >
          <span className="truncate">
            {loading ? "Loading document…" : busy ? "Finishing…" : primaryLabel}
          </span>
          {!loading && !busy && primaryLabel === "Finish" ? (
            <Check aria-hidden />
          ) : (
            !loading && !busy && <ArrowRight aria-hidden />
          )}
        </Button>
      </div>
    </div>,
    document.body,
  );
}
