"use client";

import { useEffect } from "react";

// Locks document scroll while a modal is open: ref-counted
// html[data-modal-open] (overflow hidden + overscroll none, in globals.css).
//
// - Classic scrollbars: the scrollbar's width goes on <html> as padding-right
//   while locked, so the page doesn't shift sideways. (No scrollbar-gutter.)
// - WebKit touch only: while the keyboard is also up ([data-kb-open]), iOS
//   still scrolls the page behind a modal (WebKit bug 240860). A non-passive
//   touchmove guard cancels any drag that no [data-scroll-allow] scroller can
//   take in its direction. Chrome Android needs only the CSS.

let locks = 0;
let previousPadding = "";
let removeGuard: (() => void) | null = null;

const canScroll = (el: Element, dx: number, dy: number) => {
  const style = getComputedStyle(el);
  if (Math.abs(dy) >= Math.abs(dx)) {
    if (!/(auto|scroll)/.test(style.overflowY)) return false;
    if (el.scrollHeight <= el.clientHeight) return false;
    // Finger down (dy > 0) scrolls towards the top.
    return dy > 0
      ? el.scrollTop > 0
      : el.scrollTop + el.clientHeight < el.scrollHeight - 1;
  }
  if (!/(auto|scroll)/.test(style.overflowX)) return false;
  if (el.scrollWidth <= el.clientWidth) return false;
  return dx > 0
    ? el.scrollLeft > 0
    : el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
};

function installTouchGuard() {
  let lastX = 0;
  let lastY = 0;
  const onStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;
    lastX = touch.clientX;
    lastY = touch.clientY;
  };
  const onMove = (event: TouchEvent) => {
    const root = document.documentElement;
    if (
      !root.hasAttribute("data-modal-open") ||
      !root.hasAttribute("data-kb-open") ||
      event.touches.length !== 1 ||
      !event.cancelable
    ) {
      return;
    }
    const touch = event.touches[0];
    const dx = touch.clientX - lastX;
    const dy = touch.clientY - lastY;
    lastX = touch.clientX;
    lastY = touch.clientY;
    const target = event.target instanceof Element ? event.target : null;
    const allow = target?.closest("[data-scroll-allow]");
    if (allow) {
      for (let el: Element | null = target; el; el = el.parentElement) {
        if (canScroll(el, dx, dy)) return;
        if (el === allow) break;
      }
    }
    event.preventDefault();
  };
  document.addEventListener("touchstart", onStart, { passive: true });
  document.addEventListener("touchmove", onMove, { passive: false });
  return () => {
    document.removeEventListener("touchstart", onStart);
    document.removeEventListener("touchmove", onMove);
  };
}

/** Imperative core of useScrollLock. Returns an idempotent release. */
export function acquireScrollLock(): () => void {
  if (typeof window === "undefined") return () => {};
  const root = document.documentElement;
  locks += 1;
  if (locks === 1) {
    // Measure before locking: once overflow is hidden the gap is always 0.
    const gap = window.innerWidth - root.clientWidth;
    previousPadding = root.style.paddingRight;
    if (gap > 0) root.style.paddingRight = `${gap}px`;
    root.setAttribute("data-modal-open", "");
    if ("GestureEvent" in window) removeGuard = installTouchGuard();
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks -= 1;
    if (locks === 0) {
      root.removeAttribute("data-modal-open");
      root.style.paddingRight = previousPadding;
      removeGuard?.();
      removeGuard = null;
    }
  };
}

export function useScrollLock(active: boolean) {
  useEffect(() => (active ? acquireScrollLock() : undefined), [active]);
}
