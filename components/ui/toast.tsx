"use client";

import { CircleAlert } from "lucide-react";
import type * as React from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

// Toasts: one visible at a time, queued. Reversible actions show one with
// Undo (spec D17); failures show an error toast.
//
// - Default 5s, 10s with an action. The timer pauses while the toast is
//   hovered or focused, and while any dialog[open] exists.
// - A toast shown while a <dialog> is open sits under the top layer: show
//   post-dialog toasts after closing it.

export type ToastOptions = {
  message: React.ReactNode;
  action?: { label: string; onAction: () => void };
  tone?: "neutral" | "error";
  duration?: number;
};

type ToastEntry = ToastOptions & { id: string; duration: number };

// External store. Every write replaces the array, so getSnapshot returns the
// same reference until something changes.
let queue: readonly ToastEntry[] = [];
const EMPTY: readonly ToastEntry[] = [];
const listeners = new Set<() => void>();
let nextId = 0;

const emit = () => {
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => queue;
const getServerSnapshot = () => EMPTY;

export function toast(options: ToastOptions): string {
  nextId += 1;
  const id = `toast-${nextId}`;
  const duration = options.duration ?? (options.action ? 10_000 : 5_000);
  queue = [...queue, { ...options, id, duration }];
  emit();
  return id;
}

export function dismissToast(id: string) {
  if (!queue.some((entry) => entry.id === id)) return;
  queue = queue.filter((entry) => entry.id !== id);
  emit();
}

const noop = () => () => {};
const useIsClient = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

const TICK_MS = 100;

// Screen readers announce a live region's changes, not its insertion: the
// region mounts empty and gets its text this long after.
const ANNOUNCE_DELAY_MS = 100;

const isShown = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLElement && el.isConnected && el.getClientRects().length > 0;

/** Where focus goes when the toast it was in goes away. */
const focusAfterToast = (previous: Element | null) => {
  const target = isShown(previous)
    ? previous
    : document.querySelector<HTMLElement>("main");
  if (!target) return;
  if (target.tabIndex < 0 && !target.hasAttribute("tabindex")) {
    target.setAttribute("tabindex", "-1");
  }
  target.focus({ preventScroll: true });
};

function ToastCard({
  entry,
  regionFrom,
}: {
  entry: ToastEntry;
  /** Where focus was before it went to the region itself (a caller parked it there). */
  regionFrom: () => Element | null;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const hovered = useRef(false);
  const focused = useRef(false);
  // The element focus came from when it entered the toast.
  const cameFrom = useRef<Element | null>(null);
  const [announced, setAnnounced] = useState(false);

  // Leaving (timeout, dismissal): focus on the card or on the region would
  // end up on <body> or on an empty region at the end of the document. Send
  // it back where it came from. A layout cleanup runs before the node is
  // detached, so activeElement still says where focus is. The move waits
  // for a microtask: React restores the element focused before a commit at
  // its end, which would put focus straight back on the region. The action
  // button already moved focus, so this does nothing after a click.
  useLayoutEffect(() => {
    const card = cardRef.current;
    const region = card?.parentElement ?? null;
    return () => {
      const active = document.activeElement;
      const inCard = card?.contains(active) ?? false;
      const onRegion = region != null && active === region;
      if (!inCard && !onRegion) return;
      // Focus parked on the region stays for a queued toast that follows.
      if (onRegion && queue.length > 0) return;
      const target = cameFrom.current ?? regionFrom();
      queueMicrotask(() => {
        const now = document.activeElement;
        if (now == null || now === document.body || now === region) {
          focusAfterToast(target);
        }
      });
    };
  }, [regionFrom]);

  useEffect(() => {
    const timer = setTimeout(() => setAnnounced(true), ANNOUNCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // Tick-based countdown, so pausing is a check per tick.
  useEffect(() => {
    let remaining = entry.duration;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const elapsed = now - last;
      last = now;
      const paused =
        hovered.current ||
        focused.current ||
        document.querySelector("dialog[open]") != null;
      if (paused) return;
      remaining -= elapsed;
      if (remaining <= 0) dismissToast(entry.id);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [entry.id, entry.duration]);

  // Publish --toast-h so the Fab lifts above the toast.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const root = document.documentElement;
    const publish = () =>
      root.style.setProperty(
        "--toast-h",
        `calc(${card.offsetHeight}px + 0.75rem)`,
      );
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(card);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--toast-h");
    };
  }, []);

  const error = entry.tone === "error";

  return (
    <div
      ref={cardRef}
      onPointerEnter={() => {
        hovered.current = true;
      }}
      onPointerLeave={() => {
        hovered.current = false;
      }}
      onFocus={(event) => {
        const from = event.relatedTarget as Element | null;
        if (!event.currentTarget.contains(from)) {
          // Tabbing in from the region: the origin is what the region saw.
          cameFrom.current =
            from != null && from === event.currentTarget.parentElement
              ? regionFrom()
              : from;
        }
        focused.current = true;
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          focused.current = false;
      }}
      className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[calc(var(--chrome-bottom)+0.75rem)] left-[max(1rem,env(safe-area-inset-left))] z-[70] flex items-center gap-3 rounded-[16px] border-2 border-line bg-surface px-4 py-3 font-bold text-ink motion-safe:animate-rise-in desk:right-6 desk:bottom-6 desk:left-auto desk:w-96 desk:shadow-brut-sm"
    >
      {error && (
        <CircleAlert
          aria-hidden
          className="size-5 shrink-0 text-destructive"
          strokeWidth={2.5}
        />
      )}
      <p aria-hidden className="min-w-0 flex-1 wrap-anywhere">
        {entry.message}
      </p>
      <p role={error ? "alert" : "status"} className="sr-only">
        {announced ? entry.message : null}
      </p>
      {entry.action && (
        <button
          type="button"
          onClick={() => {
            // The card unmounts: don't leave focus on <body>. The action
            // runs after, so it can move focus somewhere better.
            const hadFocus =
              cardRef.current?.contains(document.activeElement) ?? false;
            dismissToast(entry.id);
            if (hadFocus) focusAfterToast(cameFrom.current);
            entry.action?.onAction();
          }}
          className="press-flat -my-1 min-h-11 shrink-0 rounded-[10px] px-2 font-extrabold text-brand"
        >
          {entry.action.label}
        </button>
      )}
    </div>
  );
}

/**
 * Renders the current toast in a labelled region, portaled to <body>. Mount
 * once per layout (admin, signing, public).
 */
export function ToastHost() {
  const entries = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const isClient = useIsClient();
  const regionFrom = useRef<Element | null>(null);
  const getRegionFrom = useCallback(() => regionFrom.current, []);
  if (!isClient) return null;
  const current = entries[0];

  return createPortal(
    <section
      aria-label="Notifications"
      onFocus={(event) => {
        if (event.target !== event.currentTarget) return;
        const from = event.relatedTarget as Element | null;
        if (!event.currentTarget.contains(from)) regionFrom.current = from;
      }}
    >
      {current && (
        <ToastCard
          key={current.id}
          entry={current}
          regionFrom={getRegionFrom}
        />
      )}
    </section>,
    document.body,
  );
}
