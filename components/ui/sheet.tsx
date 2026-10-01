"use client";

import { X } from "lucide-react";
import * as React from "react";
import { useId, useLayoutEffect, useRef, useState } from "react";

import { announce } from "@/lib/announce";
import { acquireScrollLock } from "@/lib/use-scroll-lock";
import { COARSE_QUERY, PHONE_QUERY, mediaMatches } from "@/lib/use-media-query";
import { acquireVisualViewportVars } from "@/lib/use-visual-viewport";
import { cn } from "@/lib/utils";

// The one modal primitive (spec D6): a native <dialog> opened with
// showModal(), so it sits in the top layer above every fixed bar, makes the
// page inert and gets Esc / Android back as a `cancel` event.
//
// - Open it from a tap handler: showModal() runs in a layout effect, still
//   inside the tap's user activation, so iOS raises the keyboard.
// - It stays mounted ~200ms after `open` goes false for the exit animation
//   (0 under reduced motion).
// - The <dialog> itself has no padding. A click whose pointerdown and click
//   both land on the dialog element is a backdrop click.

export type SheetCloseReason =
  "cancel" | "backdrop" | "close-button" | "forced";

export type SheetProps = {
  open: boolean;
  onClose: (reason: SheetCloseReason) => void;
  /** Rendered as <h2 tabIndex={-1}>, and names the dialog. */
  title: React.ReactNode;
  /** Keep the title for screen readers only (full screens with their own top bar). */
  hideTitle?: boolean;
  description?: React.ReactNode;
  /** Phone presentation. Default 'sheet'. */
  presentation?: "sheet" | "full" | "action";
  /** Desk: centred card (default), top-anchored card (palette) or full screen always. */
  desktop?: "card" | "top-card" | "none";
  /** Width and chrome for the desk card, e.g. 'desk:max-w-[660px]'. Default desk:max-w-md. */
  desktopClassName?: string;
  /** Phone 'full' top bar: a 56px row with the title centred between these. */
  topBar?: { leading?: React.ReactNode; trailing?: React.ReactNode };
  /** Sticky footer, padded for the home indicator. */
  footer?: React.ReactNode;
  /** false: cancel and backdrop are ignored and a forced close re-opens (busy). Default true. */
  dismissible?: boolean;
  /** 'auto' (default): [data-autofocus] or the first focusable on a fine pointer, the title on a coarse one. */
  initialFocus?: React.RefObject<HTMLElement | null> | "title" | "auto";
  /** Size to the visual viewport (keyboard). Default: on for 'full' or when the sheet contains a text field. */
  fitVisualViewport?: boolean;
  className?: string;
  bodyClassName?: string;
  /** id on the <dialog>, e.g. for a `dialog[open]:not(#id)` check. */
  id?: string;
  /**
   * No header and no scrolling body: the consumer draws its own chrome (the
   * palette). The title still renders (sr-only with hideTitle) and names the
   * dialog. Mark the consumer's own scroller with data-scroll-allow.
   */
  bare?: boolean;
  /** Runs after the exit animation, once the dialog is closed and focus is back. */
  onExited?: () => void;
  children: React.ReactNode;
};

const EXIT_MS = 200;

// For the harness: the topmost modal is the one with the highest value.
let openSeq = 0;

const TEXT_ENTRY =
  "input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]):not([type=button]):not([type=submit]):not([type=reset]):not([type=image]):not([type=hidden]), textarea, [contenteditable]:not([contenteditable=false])";

const FOCUSABLE =
  "a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1']), [contenteditable]:not([contenteditable=false])";

const isVisible = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLElement && el.isConnected && el.getClientRects().length > 0;

/** Focus the opener, else a [data-stack-return] or the page's h1. */
const returnFocus = (opener: Element | null) => {
  const target = isVisible(opener)
    ? opener
    : (Array.from(document.querySelectorAll("[data-stack-return]")).find(
        isVisible,
      ) ?? Array.from(document.querySelectorAll("main h1")).find(isVisible));
  if (!target) return;
  if (target.tabIndex < 0 && !target.hasAttribute("tabindex")) {
    target.setAttribute("tabindex", "-1");
  }
  target.focus({ preventScroll: true });
};

const phoneClasses = {
  // Bottom sheet. With the keyboard up (vv vars set), it sits on top of it.
  sheet:
    "phone:mx-0 phone:mt-auto phone:mb-[calc(100dvh-var(--vv-top,0px)-var(--vv-h,100dvh))] phone:w-full phone:max-w-none phone:rounded-t-[20px] phone:rounded-b-none phone:border-x-0 phone:border-t-2 phone:border-b-0 phone:border-[var(--line-strong)] phone:max-h-[min(92dvh,calc(var(--vv-h,100dvh)-1rem))]",
  full: "phone:fixed phone:inset-x-0 phone:top-[var(--vv-top,0px)] phone:bottom-auto phone:m-0 phone:h-[var(--vv-h,100dvh)] phone:max-h-none phone:w-full phone:max-w-none phone:rounded-none phone:border-0",
} as const;

const deskClasses = {
  card: "desk:m-auto desk:w-[calc(100%-2rem)] desk:max-w-md desk:max-h-[90dvh] desk:rounded-[20px] desk:border-2 desk:border-line desk:shadow-brut",
  "top-card":
    "desk:mx-auto desk:mt-[10vh] desk:mb-auto desk:w-[calc(100%-2rem)] desk:max-w-md desk:max-h-[80dvh] desk:rounded-[20px] desk:border-2 desk:border-line desk:shadow-brut",
  none: "desk:fixed desk:inset-0 desk:m-0 desk:h-dvh desk:max-h-none desk:w-full desk:max-w-none desk:rounded-none desk:border-0",
} as const;

export function Sheet({
  open,
  onClose,
  title,
  hideTitle = false,
  description,
  presentation = "sheet",
  desktop = "card",
  desktopClassName,
  topBar,
  footer,
  dismissible = true,
  initialFocus = "auto",
  fitVisualViewport,
  className,
  bodyClassName,
  id,
  bare = false,
  onExited,
  children,
}: SheetProps) {
  // Mounted while open or closing. Set during render (not in an effect) so
  // the dialog exists in the same commit that opens it.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const closing = mounted && !open;

  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Latest props for native event listeners.
  const latest = useRef({
    onClose,
    dismissible,
    presentation,
    initialFocus,
    fitVisualViewport,
    onExited,
  });
  useLayoutEffect(() => {
    latest.current = {
      onClose,
      dismissible,
      presentation,
      initialFocus,
      fitVisualViewport,
      onExited,
    };
  });

  // Set while *we* are closing the dialog, so the native `close` event can
  // tell our close from one the browser forced.
  const closingRef = useRef(false);
  const returnFocusRef = useRef<Element | null>(null);

  // False once the component is really gone. StrictMode's dev re-run of
  // effects cleans up and re-runs them in the same commit, so unmount work
  // deferred to a microtask checks this first.
  const aliveRef = useRef(true);
  useLayoutEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Native events and housekeeping for as long as the dialog is mounted.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!mounted || !dialog) return;

    const releaseLock = acquireScrollLock();
    const fit =
      latest.current.fitVisualViewport ??
      (latest.current.presentation === "full" ||
        dialog.querySelector(TEXT_ENTRY) != null);
    const releaseViewport = fit ? acquireVisualViewportVars() : () => {};

    const onCancel = (event: Event) => {
      event.preventDefault();
      if (latest.current.dismissible) latest.current.onClose("cancel");
    };
    const onNativeClose = () => {
      // `close` is dispatched as a task. If the dialog is open again by then
      // (StrictMode re-running these effects on a Sheet mounted open, or a
      // re-open during the exit), the event is stale.
      if (closingRef.current || dialog.open) return;
      // The browser closed it without asking (Chrome, a second back with no
      // user activation) while React still thinks it's open.
      if (!latest.current.dismissible) {
        dialog.showModal();
        announce("Still working…");
      } else {
        latest.current.onClose("forced");
      }
    };
    let downOnBackdrop = false;
    const onPointerDown = (event: PointerEvent) => {
      downOnBackdrop = event.target === dialog;
    };
    const onClick = (event: MouseEvent) => {
      const backdrop = downOnBackdrop && event.target === dialog;
      downOnBackdrop = false;
      if (!backdrop || !latest.current.dismissible) return;
      if (latest.current.presentation === "full" && mediaMatches(PHONE_QUERY))
        return;
      latest.current.onClose("backdrop");
    };
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onNativeClose);
    dialog.addEventListener("pointerdown", onPointerDown);
    dialog.addEventListener("click", onClick);

    return () => {
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onNativeClose);
      dialog.removeEventListener("pointerdown", onPointerDown);
      dialog.removeEventListener("click", onClick);
      // Unmounted while open or closing (route change): close it as ours,
      // then return focus and report the exit as the timer would have.
      if (dialog.open) {
        closingRef.current = true;
        const hadFocus =
          dialog.contains(document.activeElement) ||
          document.activeElement == null ||
          document.activeElement === document.body;
        dialog.close();
        const opener = returnFocusRef.current;
        queueMicrotask(() => {
          if (aliveRef.current) return; // StrictMode re-run, not an unmount
          returnFocusRef.current = null;
          const active = document.activeElement;
          if (hadFocus && (active == null || active === document.body)) {
            returnFocus(opener);
          }
          latest.current.onExited?.();
        });
      }
      releaseViewport();
      releaseLock();
    };
    // Decided once per mount: re-running would close the open dialog.
  }, [mounted]);

  // Open: showModal() and initial focus. Close: animate out, then close and
  // unmount.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!mounted || !dialog) return;

    if (open) {
      closingRef.current = false;
      if (dialog.open) return; // re-opened during the exit animation
      returnFocusRef.current = document.activeElement;
      dialog.showModal();
      openSeq += 1;
      dialog.dataset.openSeq = String(openSeq);

      const focus = latest.current.initialFocus;
      let target: HTMLElement | null = null;
      if (focus === "title") target = titleRef.current;
      else if (typeof focus === "object") target = focus.current;
      else if (mediaMatches(COARSE_QUERY)) target = titleRef.current;
      else {
        const auto = dialog.querySelector("[data-autofocus]");
        target = isVisible(auto)
          ? auto
          : (Array.from(dialog.querySelectorAll(FOCUSABLE)).find(isVisible) ??
            titleRef.current);
      }
      target?.focus();
      return;
    }

    closingRef.current = true;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timer = setTimeout(
      () => {
        // Native close first: it restores focus on its own, and ours wins.
        if (dialog.open) dialog.close();
        const opener = returnFocusRef.current;
        returnFocusRef.current = null;
        returnFocus(opener);
        setMounted(false);
        latest.current.onExited?.();
      },
      reduced ? 0 : EXIT_MS,
    );
    return () => clearTimeout(timer);
  }, [open, mounted]);

  if (!mounted) return null;

  const phoneFull = presentation === "full";
  const isAction = presentation === "action";

  const heading = (
    <h2
      ref={titleRef}
      id={titleId}
      tabIndex={-1}
      className={cn(
        "outline-none",
        hideTitle
          ? "sr-only"
          : isAction
            ? "text-center text-sm font-bold text-subtle"
            : phoneFull && topBar
              ? "min-w-0 truncate text-center text-base font-extrabold text-ink"
              : "min-w-0 flex-1 text-lg font-extrabold text-ink",
      )}
    >
      {title}
    </h2>
  );

  const describe = description != null && (
    <div
      id={descriptionId}
      className={cn(
        "text-sm text-subtle",
        isAction ? "mt-1 text-center" : "mt-1.5",
      )}
    >
      {description}
    </div>
  );

  const closeButton = (
    <button
      type="button"
      aria-label="Close"
      onClick={() => onClose("close-button")}
      className="press-flat grid size-11 shrink-0 place-items-center rounded-[10px] text-ink"
    >
      <X aria-hidden className="size-5" strokeWidth={2.5} />
    </button>
  );

  let header: React.ReactNode;
  if (bare) {
    header = heading;
  } else if (phoneFull && topBar && hideTitle) {
    header = (
      <div className="flex min-h-14 items-center gap-2 border-b-2 border-line bg-surface pt-[env(safe-area-inset-top)] pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.5rem,env(safe-area-inset-left))] desk:pt-0">
        {heading}
        <div className="flex min-w-0 flex-1 items-center">{topBar.leading}</div>
        {topBar.trailing}
      </div>
    );
  } else if (phoneFull) {
    header = (
      <>
        <div className="grid min-h-14 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b-2 border-line bg-surface pt-[env(safe-area-inset-top)] pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.5rem,env(safe-area-inset-left))] desk:pt-0">
          <div className="flex min-w-0 items-center justify-start">
            {topBar ? topBar.leading : closeButton}
          </div>
          {heading}
          <div className="flex min-w-0 items-center justify-end">
            {topBar?.trailing}
          </div>
        </div>
        {description != null && (
          <div className="px-4 pt-3 desk:px-6">{describe}</div>
        )}
      </>
    );
  } else if (isAction) {
    header = hideTitle ? (
      heading
    ) : (
      <div className="border-b-2 border-line/15 px-4 pt-4 pb-3">
        {heading}
        {describe}
      </div>
    );
  } else {
    header = (
      <div className="flex items-start gap-2 pt-2 pr-2 pl-4 desk:pt-6 desk:pr-6 desk:pl-6">
        <div
          className={cn("min-w-0 flex-1 pt-2 desk:pt-0", hideTitle && "pt-0")}
        >
          {heading}
          {describe}
        </div>
        <div className="desk:hidden">{closeButton}</div>
      </div>
    );
  }

  return (
    <dialog
      ref={dialogRef}
      id={id}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description != null ? descriptionId : undefined}
      data-presentation={presentation}
      data-closing={closing ? "" : undefined}
      className={cn(
        // Replaces the UA dialog box (Canvas colours, 1em padding, medium
        // border, overflow auto). Only [open] may display.
        "flex-col overflow-hidden overscroll-contain bg-surface p-0 text-ink open:flex",
        "backdrop:bg-ink/40 desk:dark:backdrop:bg-surface/80 phone:dark:backdrop:bg-black/60",
        presentation === "full" ? phoneClasses.full : phoneClasses.sheet,
        deskClasses[desktop],
        closing
          ? "pointer-events-none backdrop:animate-fade-out motion-safe:phone:animate-sheet-down desk:animate-fade-out"
          : cn(
              "backdrop:animate-fade-in motion-safe:phone:animate-sheet-up",
              desktop === "none"
                ? "desk:animate-fade-in"
                : "desk:animate-pop-in",
            ),
        desktopClassName,
        className,
      )}
    >
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          footer == null &&
            presentation !== "full" &&
            "phone:pb-[env(safe-area-inset-bottom)]",
        )}
      >
        {header}
        {bare ? (
          children
        ) : (
          <div
            data-scroll-allow
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-contain",
              !isAction && !phoneFull && "px-4 pt-3 pb-4 desk:px-6 desk:pb-6",
              bodyClassName,
            )}
          >
            {children}
          </div>
        )}
        {footer != null && (
          <div className="pb-safe-kb border-t-2 border-line px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] desk:px-6">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}
