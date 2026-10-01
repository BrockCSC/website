"use client";

import { useEffect } from "react";

/**
 * Marks <html data-public> while a public page is mounted, so the canvas
 * past the page edges (overscroll, the iOS rubber band) is --surface
 * (globals.css). Removed again on the way into the admin.
 */
export function PublicCanvas() {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-public", "");
    return () => root.removeAttribute("data-public");
  }, []);
  return null;
}
