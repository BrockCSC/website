"use client";

import { useEffect } from "react";

// Publishes the visual viewport on <html>: --vv-top and --vv-h (layout
// viewport px) and [data-kb-open] while the on-screen keyboard is up. iOS
// never shrinks the layout viewport for the keyboard, so full-screen sheets
// size themselves with `top: var(--vv-top); height: var(--vv-h)`.
//
// Ref-counted: nested sheets share one listener, and the variables clear only
// when the last user releases them.

let users = 0;
let stop: (() => void) | null = null;

function start(vv: VisualViewport) {
  const root = document.documentElement;
  let raf = 0;
  const update = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      // Pinch-zoomed: leave the layout alone.
      if (vv.scale > 1.01) return;
      root.style.setProperty("--vv-top", `${vv.offsetTop}px`);
      root.style.setProperty("--vv-h", `${vv.height}px`);
      const keyboard = window.innerHeight - vv.height - vv.offsetTop;
      root.toggleAttribute("data-kb-open", keyboard > 120);
    });
  };
  update();
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  return () => {
    cancelAnimationFrame(raf);
    vv.removeEventListener("resize", update);
    vv.removeEventListener("scroll", update);
    root.style.removeProperty("--vv-top");
    root.style.removeProperty("--vv-h");
    root.removeAttribute("data-kb-open");
  };
}

/** Imperative core of useVisualViewportVars. Returns an idempotent release. */
export function acquireVisualViewportVars(): () => void {
  if (typeof window === "undefined" || !window.visualViewport) return () => {};
  users += 1;
  if (users === 1) stop = start(window.visualViewport);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    users -= 1;
    if (users === 0) {
      stop?.();
      stop = null;
    }
  };
}

export function useVisualViewportVars(active: boolean) {
  useEffect(() => (active ? acquireVisualViewportVars() : undefined), [active]);
}
