"use client";

import { useEffect } from "react";

/** Sets html[data-public] (globals.css paints the overscroll canvas with --surface). */
export function PublicCanvas() {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-public", "");
    return () => root.removeAttribute("data-public");
  }, []);
  return null;
}
